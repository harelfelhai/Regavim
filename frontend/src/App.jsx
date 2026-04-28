import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import MapDashboard from './components/MapDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import { fetchMe } from './services/auth';
import useAuthStore from './store/authStore';

export default function App() {
  const { token, login, logout } = useAuthStore();
  // null = still checking, false = no valid session, true = session confirmed
  const [bootstrapped, setBootstrapped] = useState(!token);

  useEffect(() => {
    if (!token) {
      setBootstrapped(true);
      return;
    }
    fetchMe()
      .then((user) => {
        login(user, token);
        setBootstrapped(true);
      })
      .catch(() => {
        // Token is stored but invalid — the 401 interceptor calls logout() and
        // redirects to /login, so we just need to stop the spinner here.
        setBootstrapped(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <MapDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

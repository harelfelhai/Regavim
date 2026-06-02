import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import LoginPage from './components/LoginPage';
import MapDashboard from './components/MapDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import CaptureGuestPage from './components/CaptureGuestPage';
import { fetchMe } from './services/auth';
import useAuthStore from './store/authStore';

/**
 * Root-URL redirect — sends authenticated users to /map, everyone else to /login.
 * Rendered only after the bootstrap phase completes, so `token` is settled.
 */
function RootRedirect() {
  const token = useAuthStore((s) => s.token);
  return <Navigate to={token ? '/map' : '/login'} replace />;
}

/**
 * Bootstrap sequence:
 *  1. If no stored token → already bootstrapped; router handles redirect.
 *  2. If a token is stored → call GET /me to verify it's still valid.
 *     • Success → hydrate user in store, show app.
 *     • 401     → the response interceptor calls logout() which clears the
 *                 token, then the router sends the user to /login.
 *  A full-screen spinner is displayed while step 2 is in progress so the
 *  user never sees a flash of the protected UI before the check resolves.
 */
export default function App() {
  const { token, login } = useAuthStore();
  // Start as "already done" when there is no token to verify.
  const [bootstrapped, setBootstrapped] = useState(!token);

  useEffect(() => {
    if (!token) return;
    fetchMe()
      .then((user) => login(user, token))
      .finally(() => setBootstrapped(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50">
        <Loader2 size={32} className="animate-spin text-blue-500" />
        <span className="text-sm text-gray-500">Checking session…</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/capture" element={<CaptureGuestPage />} />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <MapDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

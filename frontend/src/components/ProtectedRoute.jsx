import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

/**
 * Renders children when the user holds a valid token.
 * Redirects to /login when no token is present.
 */
export default function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

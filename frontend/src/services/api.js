import axios from 'axios';
import useAuthStore from '../store/authStore.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the stored Bearer token to every outgoing request.
// Does not overwrite a manually-set Authorization header (used during login).
api.interceptors.request.use((config) => {
  if (!config.headers.Authorization) {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      error.isNetworkError = true;
      error.message = 'Network error — the backend may be offline.';
    } else if (error.response.status === 401) {
      // Token expired or revoked — log the user out and hard-redirect.
      // Hard redirect discards all React state so no stale UI remains visible.
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

import axios from 'axios';
import useAuthStore from '../store/authStore.js';

// In development (and GitHub Codespaces), VITE_API_BASE_URL is unset and
// baseURL defaults to '' so that requests go to /api/v1/... on the same host.
// Vite's dev proxy then forwards those requests to http://localhost:8000 —
// server-to-server, no CORS involved.
// In production, set VITE_API_BASE_URL to the deployed API root
// (e.g. https://api.regavim.org) and the proxy is bypassed.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the stored Bearer token to every outgoing request.
// Does not overwrite a manually-set Authorization header (used during login).
api.interceptors.request.use((config) => {
  // FormData requests need the browser to auto-set Content-Type with the
  // correct multipart boundary. Remove the instance-level 'application/json'
  // default; otherwise FastAPI receives a malformed body and returns 422.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
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
      // Only auto-logout when the failing request was authenticated.
      // A 401 on an unauthenticated request (e.g. the login form with wrong
      // credentials) must propagate normally so the caller can show an error.
      const token = useAuthStore.getState().token;
      if (token) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

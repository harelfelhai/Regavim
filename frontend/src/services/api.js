import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      // Network failure, CORS block, or DNS error — no HTTP response received.
      error.isNetworkError = true;
      error.message = 'Network error — the backend may be offline.';
    }
    return Promise.reject(error);
  }
);

export default api;

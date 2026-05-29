import api from './api';

/**
 * Log in then immediately verify the token by fetching the current user.
 * Returns { user, token } on success; throws on failure.
 */
export async function loginUser(email, password) {
  const { data: tokenData } = await api.post('/api/v1/auth/login', { email, password });
  const token = tokenData.access_token;
  const { data: user } = await api.get('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { user, token };
}

/** Fetch the current user using the token already attached by the request interceptor. */
export async function fetchMe() {
  const { data } = await api.get('/api/v1/auth/me');
  return data;
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock authStore BEFORE importing api so the interceptor picks up the mock
vi.mock('../../store/authStore', () => {
  const state = { token: null, logoutCalled: false };
  const store = (selector) => selector(state);
  store.getState = () => state;
  store._state = state;
  return { default: store };
});

import useAuthStore from '../../store/authStore';

// Import api after mocks are in place
const apiModule = await import('../api');
const api = apiModule.default;

const STUB_TOKEN = 'header.payload.sig';

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore._state.token = null;
  useAuthStore._state.logoutCalled = false;
  useAuthStore.getState = () => useAuthStore._state;
  useAuthStore.getState().logout = () => {
    useAuthStore._state.logoutCalled = true;
    useAuthStore._state.token = null;
  };
});

describe('request interceptor', () => {
  it('adds Authorization header when token is set', () => {
    useAuthStore._state.token = STUB_TOKEN;
    const config = { headers: {} };
    const reqInterceptor = api.interceptors.request.handlers[0];
    const result = reqInterceptor.fulfilled(config);
    expect(result.headers.Authorization).toBe(`Bearer ${STUB_TOKEN}`);
  });

  it('does not add header when no token', () => {
    useAuthStore._state.token = null;
    const config = { headers: {} };
    const reqInterceptor = api.interceptors.request.handlers[0];
    const result = reqInterceptor.fulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('does not overwrite an existing Authorization header', () => {
    useAuthStore._state.token = STUB_TOKEN;
    const config = { headers: { Authorization: 'Bearer manual-token' } };
    const reqInterceptor = api.interceptors.request.handlers[0];
    const result = reqInterceptor.fulfilled(config);
    expect(result.headers.Authorization).toBe('Bearer manual-token');
  });

  it('removes Content-Type for FormData requests so the browser sets the multipart boundary', () => {
    useAuthStore._state.token = null;
    const config = { headers: { 'Content-Type': 'application/json' }, data: new FormData() };
    const reqInterceptor = api.interceptors.request.handlers[0];
    const result = reqInterceptor.fulfilled(config);
    expect(result.headers['Content-Type']).toBeUndefined();
  });

  it('keeps Content-Type for non-FormData requests', () => {
    useAuthStore._state.token = null;
    const config = { headers: { 'Content-Type': 'application/json' }, data: { foo: 'bar' } };
    const reqInterceptor = api.interceptors.request.handlers[0];
    const result = reqInterceptor.fulfilled(config);
    expect(result.headers['Content-Type']).toBe('application/json');
  });
});

describe('response interceptor', () => {
  it('passes through successful responses unchanged', () => {
    const response = { status: 200, data: { ok: true } };
    const resInterceptor = api.interceptors.response.handlers[0];
    expect(resInterceptor.fulfilled(response)).toBe(response);
  });

  it('tags network errors with isNetworkError', async () => {
    const error = new Error('Network Error');
    error.response = undefined;
    const resInterceptor = api.interceptors.response.handlers[0];
    await expect(resInterceptor.rejected(error)).rejects.toMatchObject({ isNetworkError: true });
  });

  it('calls logout on 401 when an auth token was present (session expired)', async () => {
    // Simulate an authenticated session: token is in the store
    useAuthStore._state.token = STUB_TOKEN;

    const originalLocation = window.location;
    delete window.location;
    window.location = { href: '' };

    const error = { response: { status: 401 } };
    const resInterceptor = api.interceptors.response.handlers[0];
    await expect(resInterceptor.rejected(error)).rejects.toBeTruthy();

    await new Promise((r) => setTimeout(r, 10));
    expect(useAuthStore._state.logoutCalled).toBe(true);

    window.location = originalLocation;
  });

  it('does NOT call logout on 401 when no token is present (e.g. wrong login credentials)', async () => {
    // Simulate an unauthenticated request (login form): no token in store
    useAuthStore._state.token = null;
    const logoutFn = vi.fn();
    useAuthStore.getState().logout = logoutFn;

    const error = { response: { status: 401 } };
    const resInterceptor = api.interceptors.response.handlers[0];
    await expect(resInterceptor.rejected(error)).rejects.toBeTruthy();

    await new Promise((r) => setTimeout(r, 10));
    expect(logoutFn).not.toHaveBeenCalled();
  });

  it('does not call logout on non-401 errors', async () => {
    useAuthStore._state.token = STUB_TOKEN;
    const logoutFn = vi.fn();
    useAuthStore.getState().logout = logoutFn;
    const error = { response: { status: 403 } };
    const resInterceptor = api.interceptors.response.handlers[0];
    await expect(resInterceptor.rejected(error)).rejects.toBeTruthy();
    expect(logoutFn).not.toHaveBeenCalled();
  });
});

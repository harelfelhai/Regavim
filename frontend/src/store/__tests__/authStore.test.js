import { beforeEach, describe, expect, it } from 'vitest';
import useAuthStore from '../authStore';

const STUB_USER = { id: 'u1', email: 'a@b.com', role: 'coordinator' };
const STUB_TOKEN = 'tok123';

function getState() {
  return useAuthStore.getState();
}

beforeEach(() => {
  // Reset store between tests
  useAuthStore.setState({ user: null, token: null });
  localStorage.clear();
});

describe('authStore', () => {
  it('initial state has null user and token', () => {
    expect(getState().user).toBeNull();
    expect(getState().token).toBeNull();
  });

  it('login sets user and token', () => {
    getState().login(STUB_USER, STUB_TOKEN);
    expect(getState().user).toEqual(STUB_USER);
    expect(getState().token).toBe(STUB_TOKEN);
  });

  it('logout clears user and token', () => {
    getState().login(STUB_USER, STUB_TOKEN);
    getState().logout();
    expect(getState().user).toBeNull();
    expect(getState().token).toBeNull();
  });

  it('token is written to localStorage on login', () => {
    getState().login(STUB_USER, STUB_TOKEN);
    const stored = JSON.parse(localStorage.getItem('regavim-auth'));
    expect(stored.state.token).toBe(STUB_TOKEN);
  });

  it('token is removed from localStorage on logout', () => {
    getState().login(STUB_USER, STUB_TOKEN);
    getState().logout();
    const stored = JSON.parse(localStorage.getItem('regavim-auth'));
    expect(stored.state.token).toBeNull();
  });

  it('user is NOT persisted to localStorage (only token is)', () => {
    getState().login(STUB_USER, STUB_TOKEN);
    const stored = JSON.parse(localStorage.getItem('regavim-auth'));
    expect(stored.state.user).toBeUndefined();
  });
});

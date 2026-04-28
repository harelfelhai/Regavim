import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import api from '../api';
import { fetchMe, loginUser } from '../auth';

const STUB_TOKEN = 'tok.abc.xyz';
const STUB_USER = { id: 'u1', email: 'coord@example.com', role: 'coordinator' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loginUser', () => {
  it('POSTs to /api/v1/auth/login with email and password', async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: STUB_TOKEN, token_type: 'bearer' } });
    api.get.mockResolvedValueOnce({ data: STUB_USER });
    await loginUser('coord@example.com', 'Pass1234!');
    expect(api.post).toHaveBeenCalledWith('/api/v1/auth/login', {
      email: 'coord@example.com',
      password: 'Pass1234!',
    });
  });

  it('GETs /api/v1/auth/me with a manual Bearer header after login', async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: STUB_TOKEN, token_type: 'bearer' } });
    api.get.mockResolvedValueOnce({ data: STUB_USER });
    await loginUser('coord@example.com', 'Pass1234!');
    expect(api.get).toHaveBeenCalledWith('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${STUB_TOKEN}` },
    });
  });

  it('returns { user, token } on success', async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: STUB_TOKEN, token_type: 'bearer' } });
    api.get.mockResolvedValueOnce({ data: STUB_USER });
    const result = await loginUser('coord@example.com', 'Pass1234!');
    expect(result).toEqual({ user: STUB_USER, token: STUB_TOKEN });
  });

  it('propagates error when login POST fails', async () => {
    const err = new Error('401');
    api.post.mockRejectedValueOnce(err);
    await expect(loginUser('x@x.com', 'bad')).rejects.toThrow('401');
  });

  it('propagates error when GET /me fails after login', async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: STUB_TOKEN } });
    const err = new Error('me failed');
    api.get.mockRejectedValueOnce(err);
    await expect(loginUser('x@x.com', 'p')).rejects.toThrow('me failed');
  });
});

describe('fetchMe', () => {
  it('calls GET /api/v1/auth/me', async () => {
    api.get.mockResolvedValueOnce({ data: STUB_USER });
    await fetchMe();
    expect(api.get).toHaveBeenCalledWith('/api/v1/auth/me');
  });

  it('returns the user object', async () => {
    api.get.mockResolvedValueOnce({ data: STUB_USER });
    const result = await fetchMe();
    expect(result).toEqual(STUB_USER);
  });
});

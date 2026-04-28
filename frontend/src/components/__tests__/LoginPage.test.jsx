import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/auth', () => ({
  loginUser: vi.fn(),
}));

const mockLogin = vi.fn();

vi.mock('../../store/authStore', () => {
  const state = { token: null, login: null };
  // selector-based call: useAuthStore((s) => s.login) → returns mockLogin
  const store = (selector) => selector(state);
  store.getState = () => state;
  store._state = state;
  return { default: store };
});

import { loginUser } from '../../services/auth';
import useAuthStore from '../../store/authStore';
import LoginPage from '../LoginPage';

function renderLoginPage(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/map" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLogin.mockReset();
  // Inject the mock login fn into the store state so the selector returns it
  useAuthStore._state.login = mockLogin;
});

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders a submit button', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('show/hide toggle changes password input type', async () => {
    const user = userEvent.setup();
    renderLoginPage();
    const input = screen.getByLabelText(/password/i);
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show/i }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /hide/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('calls loginUser with email and password on submit', async () => {
    loginUser.mockResolvedValueOnce({ user: { id: 'u1' }, token: 'tok' });
    const user = userEvent.setup();
    renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'Pass1234!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(loginUser).toHaveBeenCalledWith('a@b.com', 'Pass1234!'));
  });

  it('shows loading state while submitting', async () => {
    let resolve;
    loginUser.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'Pass1!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    resolve({ user: {}, token: 'tok' });
  });

  it('shows error message on login failure', async () => {
    loginUser.mockRejectedValueOnce({ response: { data: { detail: 'Invalid credentials' } } });
    const user = userEvent.setup();
    renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));
  });

  it('shows fallback error when no detail in response', async () => {
    loginUser.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Login failed'));
  });

  it('navigates to /map on successful login', async () => {
    loginUser.mockResolvedValueOnce({ user: { id: 'u1' }, token: 'tok' });
    const user = userEvent.setup();
    renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'Pass1!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());
  });
});

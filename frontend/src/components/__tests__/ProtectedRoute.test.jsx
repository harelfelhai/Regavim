import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/authStore', () => {
  let _token = null;
  const store = (selector) => selector({ token: _token });
  store._setToken = (t) => { _token = t; };
  store.getState = () => ({ token: _token });
  return { default: store };
});

import useAuthStore from '../../store/authStore';
import ProtectedRoute from '../ProtectedRoute';

function renderWithRouter(token) {
  useAuthStore._setToken(token);
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAuthStore._setToken(null);
});

describe('ProtectedRoute', () => {
  it('renders children when a token is present', () => {
    renderWithRouter('valid.token.here');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to /login when no token is present', () => {
    renderWithRouter(null);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('does not render children when token is absent', () => {
    renderWithRouter(null);
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children with any non-null token value', () => {
    renderWithRouter('any-string-token');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Heavy component mocks ────────────────────────────────────────────────────
vi.mock('../Map', () => ({ default: () => <div data-testid="map" /> }));
vi.mock('../ReportSidebar', () => ({ default: () => null }));
vi.mock('../FilterBar', () => ({ default: () => null }));
vi.mock('../ReportForm', () => ({ default: () => null }));
vi.mock('../ReportDetailPanel', () => ({ default: () => null }));

vi.mock('../../hooks/useReports', () => ({
  useReports: () => ({ reports: [], loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('../../store/mapStore', () => ({
  default: () => ({
    panTarget: null,
    panTo: vi.fn(),
    selectedReportId: null,
    selectReport: vi.fn(),
    clearSelection: vi.fn(),
  }),
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
const mockLogout = vi.fn();
const mockUser = { id: 'u1', email: 'admin@regavim.org', role: 'admin' };
const authState = { user: mockUser, logout: mockLogout };

vi.mock('../../store/authStore', () => ({
  default: (selector) => selector(authState),
}));

import MapDashboard from '../MapDashboard';

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/map']}>
      <Routes>
        <Route path="/map" element={<MapDashboard />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MapDashboard — logout', () => {
  it('renders the signed-in user email in the sidebar footer', () => {
    renderDashboard();
    expect(screen.getByText('admin@regavim.org')).toBeInTheDocument();
  });

  it('renders a sign-out button', () => {
    renderDashboard();
    expect(screen.getByRole('button', { name: 'יציאה' })).toBeInTheDocument();
  });

  it('calls logout when sign-out is clicked', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: 'יציאה' }));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('navigates to /login after signing out', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: 'יציאה' }));
    await waitFor(() =>
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    );
  });
});

describe('MapDashboard — layout', () => {
  it('renders the map', () => {
    renderDashboard();
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('renders the New report button', () => {
    renderDashboard();
    // Sidebar header button + mobile FAB — both carry the same aria-label.
    const btns = screen.getAllByRole('button', { name: 'דיווח חדש' });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });
});

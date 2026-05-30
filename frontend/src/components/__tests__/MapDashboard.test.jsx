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

vi.mock('../../hooks/useOfflineSync', () => ({
  useOfflineSync: () => ({
    queue: [], syncing: false, isOnline: true,
    pendingCount: 0, failedItems: [], syncNow: vi.fn(),
    discard: vi.fn(), retry: vi.fn(), refresh: vi.fn(),
  }),
}));

// Controllable viewport mock — defaults to desktop; flipped per-test for mobile.
vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}));
import { useMediaQuery } from '../../hooks/useMediaQuery';

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
  useMediaQuery.mockReturnValue(false); // default to desktop layout
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
    const btns = screen.getAllByRole('button', { name: 'דיווח חדש' });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the desktop sidebar (no bottom sheet) on wide viewports', () => {
    useMediaQuery.mockReturnValue(false);
    renderDashboard();
    expect(screen.queryByTestId('mobile-bottom-sheet')).not.toBeInTheDocument();
    expect(screen.getByText('Regavim Monitor')).toBeInTheDocument();
  });
});

describe('MapDashboard — mobile layout', () => {
  it('renders the bottom sheet instead of the desktop sidebar', () => {
    useMediaQuery.mockReturnValue(true);
    renderDashboard();
    expect(screen.getByTestId('mobile-bottom-sheet')).toBeInTheDocument();
    // The desktop-only logo header is not present on mobile.
    expect(screen.queryByText('Regavim Monitor')).not.toBeInTheDocument();
  });

  it('still exposes logout and a new-report button on mobile', () => {
    useMediaQuery.mockReturnValue(true);
    renderDashboard();
    expect(screen.getByRole('button', { name: 'יציאה' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'דיווח חדש' }).length,
    ).toBeGreaterThanOrEqual(1);
  });
});

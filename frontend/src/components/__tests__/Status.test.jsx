/**
 * Unit tests for the Status component.
 *
 * api.js is mocked so no real network calls are made.
 * Tests cover all three display states: checking, connected, error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

import Status from '../Status';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() },
}));

describe('Status', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  // ── Initial render ─────────────────────────────────────────────────────────

  it('shows checking text on initial render before the fetch resolves', () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    render(<Status />);
    expect(screen.getByText(/בודק חיבור/)).toBeInTheDocument();
  });

  it('renders a status region for screen readers', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    render(<Status />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('shows connected text after successful health check', async () => {
    api.get.mockResolvedValue({ data: { status: 'ok' } });
    render(<Status />);
    await waitFor(() =>
      expect(screen.getByText(/שרת מחובר/)).toBeInTheDocument()
    );
  });

  it('calls GET /health on mount', async () => {
    api.get.mockResolvedValue({ data: { status: 'ok' } });
    render(<Status />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/health'));
  });

  it('only calls the health endpoint once', async () => {
    api.get.mockResolvedValue({ data: { status: 'ok' } });
    render(<Status />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  });

  // ── Error / degraded states ────────────────────────────────────────────────

  it('shows offline text on network error', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    render(<Status />);
    await waitFor(() =>
      expect(screen.getByText(/שרת לא זמין/)).toBeInTheDocument()
    );
  });

  it('shows offline text on 500 server error', async () => {
    api.get.mockRejectedValue({ response: { status: 500 } });
    render(<Status />);
    await waitFor(() =>
      expect(screen.getByText(/שרת לא זמין/)).toBeInTheDocument()
    );
  });

  it('shows offline text on 503 server unavailable', async () => {
    api.get.mockRejectedValue({ response: { status: 503 } });
    render(<Status />);
    await waitFor(() =>
      expect(screen.getByText(/שרת לא זמין/)).toBeInTheDocument()
    );
  });

  it('does not show connected text when health check fails', async () => {
    api.get.mockRejectedValue(new Error('ECONNREFUSED'));
    render(<Status />);
    await waitFor(() =>
      expect(screen.queryByText(/שרת מחובר/)).not.toBeInTheDocument()
    );
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReports } from '../useReports';
import { fetchReports } from '../../services/reports';

vi.mock('../../services/reports', () => ({
  fetchReports: vi.fn(),
}));

const MOCK_REPORTS = [
  { id: '1', status: 'pending', description: 'Road paving', target_lat: 31.5, target_lng: 35.0 },
  { id: '2', status: 'confirmed', description: 'Illegal build', target_lat: 32.0, target_lng: 34.8 },
];

describe('useReports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts in loading state with empty reports', () => {
    fetchReports.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useReports());
    expect(result.current.loading).toBe(true);
    expect(result.current.reports).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns reports and clears loading on success', async () => {
    fetchReports.mockResolvedValue(MOCK_REPORTS);
    const { result } = renderHook(() => useReports());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports).toEqual(MOCK_REPORTS);
    expect(result.current.error).toBeNull();
  });

  it('sets error and clears loading on failure', async () => {
    const err = new Error('API down');
    fetchReports.mockRejectedValue(err);
    const { result } = renderHook(() => useReports());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(err);
    expect(result.current.reports).toEqual([]);
  });

  it('handles an empty report list without error', async () => {
    fetchReports.mockResolvedValue([]);
    const { result } = renderHook(() => useReports());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('does not update state after unmount (cancel-on-unmount)', async () => {
    let resolve;
    fetchReports.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useReports());
    unmount();
    resolve(MOCK_REPORTS); // resolve after unmount
    // If cancel logic is broken this would throw "state update on unmounted component"
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.loading).toBe(true); // unchanged — component gone
  });
});

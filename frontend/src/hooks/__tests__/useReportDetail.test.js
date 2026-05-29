import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReportDetail } from '../useReportDetail';
import { fetchReport, patchReport } from '../../services/reports';

vi.mock('../../services/reports', () => ({
  fetchReport: vi.fn(),
  patchReport: vi.fn(),
}));

const MOCK_REPORT = {
  id: 'r-1',
  status: 'pending',
  ai_category: 'ROAD_PAVING',
  final_category: null,
  description: 'Test',
  image_ids: [],
  user_id: 'user-1',
};

describe('useReportDetail — initial state', () => {
  it('returns null report when no reportId provided', () => {
    const { result } = renderHook(() => useReportDetail(null));
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useReportDetail — fetch lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets loading=true while fetching', () => {
    fetchReport.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReportDetail('r-1'));
    expect(result.current.loading).toBe(true);
  });

  it('sets report data on success', async () => {
    fetchReport.mockResolvedValue(MOCK_REPORT);
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.report).toEqual(MOCK_REPORT);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    fetchReport.mockRejectedValue(new Error('Not found'));
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Not found');
    expect(result.current.report).toBeNull();
  });

  it('re-fetches when reportId changes', async () => {
    fetchReport.mockResolvedValue(MOCK_REPORT);
    const { result, rerender } = renderHook(({ id }) => useReportDetail(id), {
      initialProps: { id: 'r-1' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchReport).toHaveBeenCalledWith('r-1');

    fetchReport.mockResolvedValue({ ...MOCK_REPORT, id: 'r-2' });
    rerender({ id: 'r-2' });
    await waitFor(() => expect(result.current.report?.id).toBe('r-2'));
    expect(fetchReport).toHaveBeenCalledWith('r-2');
  });

  it('does not update state after unmount', async () => {
    let resolve;
    fetchReport.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useReportDetail('r-1'));
    unmount();
    resolve(MOCK_REPORT);
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.report).toBeNull();
  });
});

describe('useReportDetail — confirmCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchReport.mockResolvedValue(MOCK_REPORT);
    patchReport.mockResolvedValue({ ...MOCK_REPORT, final_category: 'DEMOLITION', status: 'confirmed' });
  });

  it('calls patchReport with final_category', async () => {
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.confirmCategory('DEMOLITION'));
    expect(patchReport).toHaveBeenCalledWith('r-1', { final_category: 'DEMOLITION' });
  });

  it('updates report state after successful patch', async () => {
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.confirmCategory('DEMOLITION'));
    expect(result.current.report.final_category).toBe('DEMOLITION');
  });

  it('calls onPatched callback on success', async () => {
    const onPatched = vi.fn();
    const { result } = renderHook(() => useReportDetail('r-1', { onPatched }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.confirmCategory('DEMOLITION'));
    expect(onPatched).toHaveBeenCalled();
  });

  it('returns true on success', async () => {
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let ok;
    await act(async () => { ok = await result.current.confirmCategory('DEMOLITION'); });
    expect(ok).toBe(true);
  });

  it('sets patchError and returns false on failure', async () => {
    patchReport.mockRejectedValue(new Error('Patch failed'));
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let ok;
    await act(async () => { ok = await result.current.confirmCategory('DEMOLITION'); });
    expect(ok).toBe(false);
    expect(result.current.patchError).toBe('Patch failed');
  });

  it('sets patching=true during request and false after', async () => {
    let resolvePatch;
    patchReport.mockReturnValue(new Promise((r) => { resolvePatch = r; }));
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.confirmCategory('DEMOLITION'); });
    expect(result.current.patching).toBe(true);
    await act(async () => { resolvePatch({ ...MOCK_REPORT, final_category: 'DEMOLITION' }); });
    expect(result.current.patching).toBe(false);
  });
});

describe('useReportDetail — requestDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchReport.mockResolvedValue(MOCK_REPORT);
    patchReport.mockResolvedValue({ ...MOCK_REPORT, status: 'deletion_requested' });
  });

  it('calls patchReport with status=deletion_requested', async () => {
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.requestDeletion());
    expect(patchReport).toHaveBeenCalledWith('r-1', { status: 'deletion_requested' });
  });

  it('updates report status to deletion_requested on success', async () => {
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.requestDeletion());
    expect(result.current.report.status).toBe('deletion_requested');
  });

  it('calls onPatched callback on success', async () => {
    const onPatched = vi.fn();
    const { result } = renderHook(() => useReportDetail('r-1', { onPatched }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.requestDeletion());
    expect(onPatched).toHaveBeenCalled();
  });

  it('returns true on success', async () => {
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let ok;
    await act(async () => { ok = await result.current.requestDeletion(); });
    expect(ok).toBe(true);
  });

  it('sets patchError and returns false on failure', async () => {
    patchReport.mockRejectedValue(new Error('Request failed'));
    const { result } = renderHook(() => useReportDetail('r-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let ok;
    await act(async () => { ok = await result.current.requestDeletion(); });
    expect(ok).toBe(false);
    expect(result.current.patchError).toBe('Request failed');
  });

  it('returns false immediately when reportId is null', async () => {
    const { result } = renderHook(() => useReportDetail(null));
    let ok;
    await act(async () => { ok = await result.current.requestDeletion(); });
    expect(ok).toBe(false);
    expect(patchReport).not.toHaveBeenCalled();
  });
});

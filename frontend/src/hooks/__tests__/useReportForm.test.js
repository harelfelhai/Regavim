import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReportForm, STEP } from '../useReportForm';
import { submitReport } from '../../services/reports';
import { enqueueReport } from '../../services/offlineQueue';

vi.mock('../../services/reports', () => ({
  submitReport: vi.fn(),
  createReport: vi.fn(),
}));

vi.mock('../../services/offlineQueue', () => ({
  enqueueReport: vi.fn(),
}));

global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
global.URL.revokeObjectURL = vi.fn();

const mockFile = new File(['x'], 'test.jpg', { type: 'image/jpeg' });

describe('useReportForm — initial state', () => {
  it('starts in IDLE step with no preview or error', () => {
    const { result } = renderHook(() => useReportForm());
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useReportForm — file pick', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets imagePreview immediately when file is picked', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.imagePreview).toBe('blob:mock-preview');
  });

  it('transitions IDLE → READY synchronously (no upload)', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.step).toBe(STEP.READY);
  });

  it('does not call submitReport when file is picked', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(submitReport).not.toHaveBeenCalled();
  });
});

describe('useReportForm — submit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitReport.mockResolvedValue({ id: 'report-1', status: 'confirmed' });
  });

  it('transitions READY → SUBMITTING → DONE', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.step).toBe(STEP.READY);
    act(() => { result.current.handleSubmit({ description: 'test', finalCategory: 'ROAD_PAVING' }); });
    expect(result.current.step).toBe(STEP.SUBMITTING);
    await waitFor(() => expect(result.current.step).toBe(STEP.DONE));
  });

  it('calls submitReport with file, metadata, description, category, and tags', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => {
      result.current.handleFileChange(mockFile, {
        userLat: 31.5, userLng: 34.9, targetLat: 31.6, targetLng: 35.0,
        observedAt: '2024-01-01T00:00:00.000Z',
      });
    });
    await act(() => result.current.handleSubmit({
      description: 'observed', finalCategory: 'ROAD_PAVING', tags: ['פרשייה א'],
    }));
    expect(submitReport).toHaveBeenCalledWith(mockFile, {
      description:   'observed',
      finalCategory: 'ROAD_PAVING',
      tags:          ['פרשייה א'],
      userLat:   31.5,
      userLng:   34.9,
      targetLat: 31.6,
      targetLng: 35.0,
      observedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('returns true on success', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    let ok;
    await act(async () => { ok = await result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }); });
    expect(ok).toBe(true);
  });

  it('does nothing when no file has been picked', async () => {
    const { result } = renderHook(() => useReportForm());
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('transitions to ERROR on submit failure', async () => {
    submitReport.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    expect(result.current.step).toBe(STEP.ERROR);
    expect(result.current.error).toBe('Network error');
  });

  it('returns false on submit failure', async () => {
    submitReport.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    let ok;
    await act(async () => { ok = await result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }); });
    expect(ok).toBe(false);
  });

  it('uses fallback message when error has no message', async () => {
    submitReport.mockRejectedValue({});
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    expect(result.current.error).toBe('השליחה נכשלה. נסה/י שנית.');
  });
});

describe('useReportForm — offline queuing (QUEUED step)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueReport.mockResolvedValue('queued-id-123');
  });

  it('transitions to QUEUED when submit fails with a network error', async () => {
    const err = new Error('Network');
    err.isNetworkError = true;
    submitReport.mockRejectedValue(err);
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await act(() => result.current.handleSubmit({ description: 'test', finalCategory: 'OTHER' }));
    expect(result.current.step).toBe(STEP.QUEUED);
  });

  it('transitions to QUEUED when submit times out', async () => {
    const err = new Error('Timeout');
    err.isTimeout = true;
    submitReport.mockRejectedValue(err);
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    expect(result.current.step).toBe(STEP.QUEUED);
  });

  it('returns "queued" string on network error', async () => {
    const err = new Error('Network');
    err.isNetworkError = true;
    submitReport.mockRejectedValue(err);
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    let res;
    await act(async () => { res = await result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }); });
    expect(res).toBe('queued');
  });

  it('calls enqueueReport with the file and collected fields', async () => {
    const err = new Error('Network');
    err.isNetworkError = true;
    submitReport.mockRejectedValue(err);
    const { result } = renderHook(() => useReportForm());
    act(() => {
      result.current.handleFileChange(mockFile, {
        targetLat: 31.5, targetLng: 35.0, userLat: 31.4, userLng: 34.9,
        observedAt: '2024-01-01T10:00:00.000Z',
      });
    });
    await act(() => result.current.handleSubmit({ description: 'observed', finalCategory: 'ROAD_PAVING' }));
    expect(enqueueReport).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({
        description:   'observed',
        finalCategory: 'ROAD_PAVING',
        targetLat:     31.5,
        targetLng:     35.0,
      }),
    );
  });

  it('falls back to ERROR state if enqueueReport throws', async () => {
    const netErr = new Error('Network');
    netErr.isNetworkError = true;
    submitReport.mockRejectedValue(netErr);
    enqueueReport.mockRejectedValue(new Error('IDB quota exceeded'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    expect(result.current.step).toBe(STEP.ERROR);
    expect(result.current.error).toBe('לא ניתן לשמור. בדוק/י שיש מספיק מקום פנוי.');
  });
});

describe('useReportForm — reset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores IDLE state and clears all fields', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.step).toBe(STEP.READY);
    act(() => { result.current.reset(); });
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useReportForm — cancelAndCleanup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resets to IDLE', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    act(() => { result.current.cancelAndCleanup(); });
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
  });

  it('makes no network calls', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    act(() => { result.current.cancelAndCleanup(); });
    expect(submitReport).not.toHaveBeenCalled();
  });
});

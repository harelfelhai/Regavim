import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReportForm, STEP } from '../useReportForm';
import { createReport, patchReport, deleteReport } from '../../services/reports';
import { uploadImage, analyzeImage } from '../../services/images';

vi.mock('../../services/reports', () => ({
  createReport: vi.fn(),
  patchReport: vi.fn(),
  deleteReport: vi.fn(),
}));

vi.mock('../../services/images', () => ({
  uploadImage: vi.fn(),
  analyzeImage: vi.fn(),
}));

// Suppress URL.createObjectURL not implemented in jsdom
global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
global.URL.revokeObjectURL = vi.fn();

const mockFile = new File(['x'], 'test.jpg', { type: 'image/jpeg' });

describe('useReportForm — initial state', () => {
  it('starts in IDLE step with no preview or error', () => {
    const { result } = renderHook(() => useReportForm());
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
    expect(result.current.aiCategory).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useReportForm — successful file upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockResolvedValue({ id: 'img-1' });
    analyzeImage.mockResolvedValue({ ai_category: 'ILLEGAL_CONSTRUCTION', analysis_available: true });
    deleteReport.mockResolvedValue(undefined);
  });

  it('sets imagePreview immediately when file is picked', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.imagePreview).toBe('blob:mock-preview');
  });

  it('transitions IDLE → UPLOADING → ANALYZING → READY', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.step).toBe(STEP.UPLOADING);
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
  });

  it('sets aiCategory and analysisAvailable after READY', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    expect(result.current.aiCategory).toBe('ILLEGAL_CONSTRUCTION');
    expect(result.current.analysisAvailable).toBe(true);
  });

  it('calls createReport, uploadImage, analyzeImage in order', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    expect(createReport).toHaveBeenCalledWith({});
    expect(uploadImage).toHaveBeenCalledWith('report-1', mockFile);
    expect(analyzeImage).toHaveBeenCalledWith('img-1');
  });
});

describe('useReportForm — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteReport.mockResolvedValue(undefined);
  });

  it('transitions to ERROR when createReport fails', async () => {
    createReport.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(result.current.error).toBe('Server error');
  });

  it('does not attempt cleanup when createReport itself fails (no report ID yet)', async () => {
    createReport.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(deleteReport).not.toHaveBeenCalled();
  });

  it('transitions to ERROR when uploadImage fails', async () => {
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockRejectedValue(new Error('Upload error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(result.current.error).toBe('Upload error');
  });

  it('attempts force-delete cleanup when uploadImage fails', async () => {
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockRejectedValue(new Error('Upload error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    await waitFor(() => expect(deleteReport).toHaveBeenCalledWith('report-1', { force: true }));
  });

  it('falls back to soft-delete when force-delete is rejected (image already attached)', async () => {
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockResolvedValue({ id: 'img-1' });
    analyzeImage.mockRejectedValue(new Error('AI error'));
    deleteReport.mockRejectedValueOnce(new Error('conflict')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    await waitFor(() => expect(deleteReport).toHaveBeenCalledTimes(2));
    expect(deleteReport).toHaveBeenNthCalledWith(1, 'report-1', { force: true });
    expect(deleteReport).toHaveBeenNthCalledWith(2, 'report-1');
  });

  it('transitions to ERROR when analyzeImage fails', async () => {
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockResolvedValue({ id: 'img-1' });
    analyzeImage.mockRejectedValue(new Error('AI error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(result.current.error).toBe('AI error');
  });

  it('uses fallback message when error has no message', async () => {
    createReport.mockRejectedValue({});
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(result.current.error).toBe('Upload failed. Please try again.');
  });
});

describe('useReportForm — submit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockResolvedValue({ id: 'img-1' });
    analyzeImage.mockResolvedValue({ ai_category: 'ROAD_PAVING', analysis_available: true });
    patchReport.mockResolvedValue({ id: 'report-1', status: 'confirmed' });
    deleteReport.mockResolvedValue(undefined);
  });

  it('transitions READY → SUBMITTING → DONE', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.handleSubmit({ description: 'test', finalCategory: 'ROAD_PAVING' }); });
    expect(result.current.step).toBe(STEP.SUBMITTING);
    await waitFor(() => expect(result.current.step).toBe(STEP.DONE));
  });

  it('calls patchReport with description and final_category', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    await act(() => result.current.handleSubmit({ description: 'observed', finalCategory: 'ROAD_PAVING' }));
    expect(patchReport).toHaveBeenCalledWith('report-1', {
      description: 'observed',
      status: 'confirmed',
      final_category: 'ROAD_PAVING',
    });
  });

  it('omits final_category from payload when not provided', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    await act(() => result.current.handleSubmit({ description: 'observed', finalCategory: null }));
    expect(patchReport).toHaveBeenCalledWith('report-1', {
      description: 'observed',
      status: 'confirmed',
    });
  });

  it('transitions to ERROR on submit failure', async () => {
    patchReport.mockRejectedValue(new Error('Patch error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: null }));
    expect(result.current.step).toBe(STEP.ERROR);
    expect(result.current.error).toBe('Patch error');
  });
});

describe('useReportForm — reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockResolvedValue({ id: 'img-1' });
    analyzeImage.mockResolvedValue({ ai_category: 'ROAD_PAVING', analysis_available: true });
    deleteReport.mockResolvedValue(undefined);
  });

  it('restores IDLE state and clears all fields', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.reset(); });
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
    expect(result.current.aiCategory).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useReportForm — cancelAndCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createReport.mockResolvedValue({ id: 'report-1' });
    uploadImage.mockResolvedValue({ id: 'img-1' });
    analyzeImage.mockResolvedValue({ ai_category: 'ROAD_PAVING', analysis_available: true });
    deleteReport.mockResolvedValue(undefined);
  });

  it('resets to IDLE when called from READY state', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.cancelAndCleanup(); });
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
    expect(result.current.aiCategory).toBeNull();
  });

  it('calls deleteReport with force:true when a report ID exists', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.cancelAndCleanup(); });
    await waitFor(() => expect(deleteReport).toHaveBeenCalledWith('report-1', { force: true }));
  });

  it('does not call deleteReport when no report exists (IDLE state)', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.cancelAndCleanup(); });
    expect(deleteReport).not.toHaveBeenCalled();
  });

  it('falls back to soft-delete when force-delete is rejected', async () => {
    deleteReport.mockRejectedValueOnce(new Error('conflict')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.cancelAndCleanup(); });
    await waitFor(() => expect(deleteReport).toHaveBeenCalledTimes(2));
    expect(deleteReport).toHaveBeenNthCalledWith(1, 'report-1', { force: true });
    expect(deleteReport).toHaveBeenNthCalledWith(2, 'report-1');
  });
});

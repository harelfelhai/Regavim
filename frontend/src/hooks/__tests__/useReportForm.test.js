import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReportForm, STEP } from '../useReportForm';
import { createReport } from '../../services/reports';
import { uploadImage, deleteImage } from '../../services/images';

vi.mock('../../services/reports', () => ({
  createReport: vi.fn(),
}));

vi.mock('../../services/images', () => ({
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
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
    expect(result.current.error).toBeNull();
  });
});

describe('useReportForm — upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadImage.mockResolvedValue({ id: 'img-1' });
    deleteImage.mockResolvedValue(undefined);
  });

  it('sets imagePreview immediately when file is picked', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.imagePreview).toBe('blob:mock-preview');
  });

  it('transitions IDLE → UPLOADING → READY', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    expect(result.current.step).toBe(STEP.UPLOADING);
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
  });

  it('uploads a staged image (no report) — no createReport yet', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    expect(uploadImage).toHaveBeenCalledWith(mockFile);
    expect(createReport).not.toHaveBeenCalled();
  });
});

describe('useReportForm — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteImage.mockResolvedValue(undefined);
  });

  it('transitions to ERROR when uploadImage fails', async () => {
    uploadImage.mockRejectedValue(new Error('Upload error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(result.current.error).toBe('Upload error');
  });

  it('does not delete an image when upload itself fails (no image ID yet)', async () => {
    uploadImage.mockRejectedValue(new Error('Upload error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('uses fallback message when error has no message', async () => {
    uploadImage.mockRejectedValue({});
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.ERROR));
    expect(result.current.error).toBe('ההעלאה נכשלה. נסה/י שנית.');
  });
});

describe('useReportForm — submit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadImage.mockResolvedValue({ id: 'img-1' });
    createReport.mockResolvedValue({ id: 'report-1', status: 'confirmed' });
    deleteImage.mockResolvedValue(undefined);
  });

  it('transitions READY → SUBMITTING → DONE', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.handleSubmit({ description: 'test', finalCategory: 'ROAD_PAVING' }); });
    expect(result.current.step).toBe(STEP.SUBMITTING);
    await waitFor(() => expect(result.current.step).toBe(STEP.DONE));
  });

  it('creates the report with metadata, image_id, description, category, and tags', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => {
      result.current.handleFileChange(mockFile, {
        userLat: 31.5, userLng: 34.9, targetLat: 31.6, targetLng: 35.0,
        observedAt: '2024-01-01T00:00:00.000Z',
      });
    });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    await act(() => result.current.handleSubmit({
      description: 'observed', finalCategory: 'ROAD_PAVING', tags: ['פרשייה א'],
    }));
    expect(createReport).toHaveBeenCalledWith({
      description: 'observed',
      image_id: 'img-1',
      user_lat: 31.5,
      user_lng: 34.9,
      target_lat: 31.6,
      target_lng: 35.0,
      observed_at: '2024-01-01T00:00:00.000Z',
      final_category: 'ROAD_PAVING',
      tags: ['פרשייה א'],
    });
  });

  it('omits final_category from payload when not provided', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    await act(() => result.current.handleSubmit({ description: 'observed', finalCategory: null }));
    expect(createReport).toHaveBeenCalledWith({ description: 'observed', image_id: 'img-1' });
  });

  it('does nothing when there is no staged image', async () => {
    const { result } = renderHook(() => useReportForm());
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    expect(createReport).not.toHaveBeenCalled();
  });

  it('transitions to ERROR on submit failure', async () => {
    createReport.mockRejectedValue(new Error('Create error'));
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    expect(result.current.step).toBe(STEP.ERROR);
    expect(result.current.error).toBe('Create error');
  });

  it('does not delete the image after a successful submit (now linked)', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    await act(() => result.current.handleSubmit({ description: 'x', finalCategory: 'OTHER' }));
    act(() => { result.current.cancelAndCleanup(); });
    expect(deleteImage).not.toHaveBeenCalled();
  });
});

describe('useReportForm — reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadImage.mockResolvedValue({ id: 'img-1' });
    deleteImage.mockResolvedValue(undefined);
  });

  it('restores IDLE state and clears all fields', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.reset(); });
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useReportForm — cancelAndCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadImage.mockResolvedValue({ id: 'img-1' });
    deleteImage.mockResolvedValue(undefined);
  });

  it('resets to IDLE when called from READY state', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.cancelAndCleanup(); });
    expect(result.current.step).toBe(STEP.IDLE);
    expect(result.current.imagePreview).toBeNull();
  });

  it('deletes the staged image when one exists', async () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.handleFileChange(mockFile); });
    await waitFor(() => expect(result.current.step).toBe(STEP.READY));
    act(() => { result.current.cancelAndCleanup(); });
    await waitFor(() => expect(deleteImage).toHaveBeenCalledWith('img-1'));
  });

  it('does not call deleteImage when no image exists (IDLE state)', () => {
    const { result } = renderHook(() => useReportForm());
    act(() => { result.current.cancelAndCleanup(); });
    expect(deleteImage).not.toHaveBeenCalled();
  });
});

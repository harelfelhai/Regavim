import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadImage, analyzeImage } from '../images';
import api from '../api';

vi.mock('../api', () => ({
  default: { post: vi.fn() },
}));

describe('uploadImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs to /api/v1/images/upload with FormData and a long timeout', async () => {
    api.post.mockResolvedValue({ data: { id: 'img-1', has_exif: false } });
    await uploadImage('report-42', new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/images/upload',
      expect.any(FormData),
      { timeout: 120_000 },
    );
  });

  it('includes report_id and file fields in the FormData', async () => {
    api.post.mockResolvedValue({ data: { id: 'img-1', has_exif: false } });
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await uploadImage('report-42', file);
    const fd = api.post.mock.calls[0][1];
    expect(fd.get('report_id')).toBe('report-42');
    expect(fd.get('file')).toBe(file);
  });

  it('returns the data object from the response', async () => {
    const mockImage = { id: 'img-1', has_exif: true };
    api.post.mockResolvedValue({ data: mockImage });
    const result = await uploadImage('report-42', new File(['x'], 'p.jpg'));
    expect(result).toEqual(mockImage);
  });

  it('propagates API errors', async () => {
    api.post.mockRejectedValue(new Error('Upload failed'));
    await expect(uploadImage('r', new File(['x'], 'p.jpg'))).rejects.toThrow('Upload failed');
  });
});

describe('analyzeImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs to /api/v1/images/analyze with FormData and a long timeout', async () => {
    api.post.mockResolvedValue({ data: { ai_category: 'ILLEGAL_CONSTRUCTION', analysis_available: true } });
    await analyzeImage('img-99');
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/images/analyze',
      expect.any(FormData),
      { timeout: 90_000 },
    );
  });

  it('includes image_id in the FormData', async () => {
    api.post.mockResolvedValue({ data: { ai_category: null, analysis_available: false } });
    await analyzeImage('img-99');
    const fd = api.post.mock.calls[0][1];
    expect(fd.get('image_id')).toBe('img-99');
  });

  it('returns the analysis result from the response', async () => {
    const mockAnalysis = { ai_category: 'ROAD_PAVING', analysis_available: true };
    api.post.mockResolvedValue({ data: mockAnalysis });
    const result = await analyzeImage('img-99');
    expect(result).toEqual(mockAnalysis);
  });

  it('propagates API errors', async () => {
    api.post.mockRejectedValue(new Error('Analysis failed'));
    await expect(analyzeImage('img-99')).rejects.toThrow('Analysis failed');
  });
});

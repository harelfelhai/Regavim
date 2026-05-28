import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadImage, deleteImage } from '../images';
import api from '../api';

vi.mock('../api', () => ({
  default: { post: vi.fn(), delete: vi.fn() },
}));

describe('uploadImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs to /api/v1/images/upload with FormData and a long timeout', async () => {
    api.post.mockResolvedValue({ data: { id: 'img-1', has_exif: false } });
    await uploadImage(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/images/upload',
      expect.any(FormData),
      { timeout: 120_000 },
    );
  });

  it('includes the file but no report_id (staged upload)', async () => {
    api.post.mockResolvedValue({ data: { id: 'img-1', has_exif: false } });
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await uploadImage(file);
    const fd = api.post.mock.calls[0][1];
    expect(fd.get('file')).toBe(file);
    expect(fd.get('report_id')).toBeNull();
  });

  it('returns the data object from the response', async () => {
    const mockImage = { id: 'img-1', has_exif: true };
    api.post.mockResolvedValue({ data: mockImage });
    const result = await uploadImage(new File(['x'], 'p.jpg'));
    expect(result).toEqual(mockImage);
  });

  it('propagates API errors', async () => {
    api.post.mockRejectedValue(new Error('Upload failed'));
    await expect(uploadImage(new File(['x'], 'p.jpg'))).rejects.toThrow('Upload failed');
  });
});

describe('deleteImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DELETEs /api/v1/images/:id', async () => {
    api.delete.mockResolvedValue(undefined);
    await deleteImage('img-7');
    expect(api.delete).toHaveBeenCalledWith('/api/v1/images/img-7');
  });

  it('propagates API errors', async () => {
    api.delete.mockRejectedValue(new Error('Delete failed'));
    await expect(deleteImage('img-7')).rejects.toThrow('Delete failed');
  });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchReports } from '../reports';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn() },
}));

describe('fetchReports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls GET /api/v1/reports/ with no params by default', async () => {
    api.get.mockResolvedValue({ data: [] });
    await fetchReports();
    expect(api.get).toHaveBeenCalledWith('/api/v1/reports/', { params: {} });
  });

  it('passes filter params to the API call', async () => {
    api.get.mockResolvedValue({ data: [] });
    await fetchReports({ status: 'pending' });
    expect(api.get).toHaveBeenCalledWith('/api/v1/reports/', {
      params: { status: 'pending' },
    });
  });

  it('returns the data array from the response', async () => {
    const mockReports = [{ id: '1', status: 'pending' }];
    api.get.mockResolvedValue({ data: mockReports });
    const result = await fetchReports();
    expect(result).toEqual(mockReports);
  });

  it('returns an empty array when the backend has no reports', async () => {
    api.get.mockResolvedValue({ data: [] });
    const result = await fetchReports();
    expect(result).toEqual([]);
  });

  it('propagates errors from the API client', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    await expect(fetchReports()).rejects.toThrow('Network Error');
  });
});

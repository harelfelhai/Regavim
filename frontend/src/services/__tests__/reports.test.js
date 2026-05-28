import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchReports, fetchReport, createReport, patchReport, deleteReport } from '../reports';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

describe('fetchReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls GET /api/v1/reports/:id', async () => {
    api.get.mockResolvedValue({ data: { id: 'r-1' } });
    await fetchReport('r-1');
    expect(api.get).toHaveBeenCalledWith('/api/v1/reports/r-1');
  });

  it('returns the report data', async () => {
    const mock = { id: 'r-1', status: 'pending', image_ids: [] };
    api.get.mockResolvedValue({ data: mock });
    const result = await fetchReport('r-1');
    expect(result).toEqual(mock);
  });

  it('propagates errors', async () => {
    api.get.mockRejectedValue(new Error('Not found'));
    await expect(fetchReport('r-1')).rejects.toThrow('Not found');
  });
});

describe('createReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs to /api/v1/reports/ with empty payload by default', async () => {
    api.post.mockResolvedValue({ data: { id: 'r-1' } });
    await createReport();
    expect(api.post).toHaveBeenCalledWith('/api/v1/reports/', {}, { params: undefined });
  });

  it('forwards payload fields to the POST body', async () => {
    api.post.mockResolvedValue({ data: { id: 'r-1' } });
    await createReport({ description: 'test' });
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/reports/',
      { description: 'test' },
      { params: undefined },
    );
  });

  it('sends ?draft=true when creating a draft', async () => {
    api.post.mockResolvedValue({ data: { id: 'r-1' } });
    await createReport({ description: 'test' }, { draft: true });
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/reports/',
      { description: 'test' },
      { params: { draft: 'true' } },
    );
  });

  it('returns the created report data', async () => {
    const mock = { id: 'r-1', status: 'pending' };
    api.post.mockResolvedValue({ data: mock });
    const result = await createReport({});
    expect(result).toEqual(mock);
  });

  it('propagates errors', async () => {
    api.post.mockRejectedValue(new Error('Create failed'));
    await expect(createReport()).rejects.toThrow('Create failed');
  });
});

describe('patchReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCHes /api/v1/reports/:id with the payload', async () => {
    api.patch.mockResolvedValue({ data: { id: 'r-1' } });
    await patchReport('r-1', { status: 'confirmed' });
    expect(api.patch).toHaveBeenCalledWith('/api/v1/reports/r-1', { status: 'confirmed' });
  });

  it('returns the patched report data', async () => {
    const mock = { id: 'r-1', status: 'confirmed' };
    api.patch.mockResolvedValue({ data: mock });
    const result = await patchReport('r-1', { status: 'confirmed' });
    expect(result).toEqual(mock);
  });

  it('propagates errors', async () => {
    api.patch.mockRejectedValue(new Error('Patch failed'));
    await expect(patchReport('r-1', {})).rejects.toThrow('Patch failed');
  });
});

describe('deleteReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DELETEs /api/v1/reports/:id with no params by default (soft-delete)', async () => {
    api.delete.mockResolvedValue({});
    await deleteReport('r-1');
    expect(api.delete).toHaveBeenCalledWith('/api/v1/reports/r-1', { params: undefined });
  });

  it('passes ?force=true when force option is set (hard-delete)', async () => {
    api.delete.mockResolvedValue({});
    await deleteReport('r-1', { force: true });
    expect(api.delete).toHaveBeenCalledWith('/api/v1/reports/r-1', { params: { force: 'true' } });
  });

  it('propagates errors', async () => {
    api.delete.mockRejectedValue(new Error('Delete failed'));
    await expect(deleteReport('r-1')).rejects.toThrow('Delete failed');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  enqueueReport,
  getAllQueuedItems,
  removeQueuedItem,
  setQueuedItemStatus,
  drainQueue,
} from '../offlineQueue';

vi.mock('../reports', () => ({
  submitReport: vi.fn(),
}));

// drainQueue skips if no token — provide one so tests exercise the real code path.
vi.mock('../../store/authStore', () => ({
  default: { getState: () => ({ token: 'test-token' }) },
}));

import { submitReport } from '../reports';

const mockFile   = new File(['x'], 'test.jpg', { type: 'image/jpeg' });
const mockFields = { description: 'test', finalCategory: 'OTHER' };

// Give each test a clean DB state by discarding all items between runs.
beforeEach(async () => {
  vi.clearAllMocks();
  const items = await getAllQueuedItems();
  await Promise.all(items.map(i => removeQueuedItem(i.id)));
});

describe('enqueueReport', () => {
  it('stores an item with status "pending"', async () => {
    await enqueueReport(mockFile, mockFields);
    const items = await getAllQueuedItems();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('pending');
  });

  it('stores the File Blob and fields', async () => {
    await enqueueReport(mockFile, mockFields);
    const [item] = await getAllQueuedItems();
    // fake-indexeddb doesn't preserve File identity; real IDB stores Blobs natively.
    expect(item.file).toBeDefined();
    expect(item.fields).toEqual(mockFields);
  });

  it('returns a UUID string id', async () => {
    const id = await enqueueReport(mockFile, mockFields);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('queuing multiple items keeps all of them', async () => {
    await enqueueReport(mockFile, mockFields);
    await enqueueReport(mockFile, { description: 'second' });
    const items = await getAllQueuedItems();
    expect(items).toHaveLength(2);
  });
});

describe('removeQueuedItem', () => {
  it('removes the item by id', async () => {
    const id = await enqueueReport(mockFile, mockFields);
    await removeQueuedItem(id);
    const items = await getAllQueuedItems();
    expect(items).toHaveLength(0);
  });
});

describe('setQueuedItemStatus', () => {
  it('updates status and error', async () => {
    const id = await enqueueReport(mockFile, mockFields);
    await setQueuedItemStatus(id, 'failed', 'server error');
    const [item] = await getAllQueuedItems();
    expect(item.status).toBe('failed');
    expect(item.error).toBe('server error');
  });

  it('clears error when status reverts to pending', async () => {
    const id = await enqueueReport(mockFile, mockFields);
    await setQueuedItemStatus(id, 'failed', 'err');
    await setQueuedItemStatus(id, 'pending', null);
    const [item] = await getAllQueuedItems();
    expect(item.status).toBe('pending');
    expect(item.error).toBeNull();
  });
});

describe('drainQueue', () => {
  it('removes item after successful upload', async () => {
    submitReport.mockResolvedValue({ id: 'r-1' });
    await enqueueReport(mockFile, mockFields);
    await drainQueue();
    const items = await getAllQueuedItems();
    expect(items).toHaveLength(0);
  });

  it('returns the count of uploaded items', async () => {
    submitReport.mockResolvedValue({ id: 'r-1' });
    await enqueueReport(mockFile, mockFields);
    await enqueueReport(mockFile, { description: 'second' });
    const count = await drainQueue();
    expect(count).toBe(2);
  });

  it('marks item as failed on 4xx error', async () => {
    const err = new Error('Bad request');
    err.response = { data: { detail: 'נדרש תיאור' } };
    submitReport.mockRejectedValue(err);
    await enqueueReport(mockFile, mockFields);
    await drainQueue();
    const [item] = await getAllQueuedItems();
    expect(item.status).toBe('failed');
    expect(item.error).toBe('נדרש תיאור');
  });

  it('resets item to pending on network error and stops', async () => {
    const err = new Error('Network');
    err.isNetworkError = true;
    submitReport.mockRejectedValue(err);
    await enqueueReport(mockFile, mockFields);
    await enqueueReport(mockFile, { description: 'second' });
    await drainQueue();
    const items = await getAllQueuedItems();
    expect(items.every(i => i.status === 'pending')).toBe(true);
    // Only one call — loop stopped after first network error
    expect(submitReport).toHaveBeenCalledTimes(1);
  });

  it('skips items already marked uploading', async () => {
    submitReport.mockResolvedValue({ id: 'r-1' });
    const id = await enqueueReport(mockFile, mockFields);
    await setQueuedItemStatus(id, 'uploading');
    await drainQueue();
    // Item was in-flight — drainQueue left it alone
    const items = await getAllQueuedItems();
    expect(items).toHaveLength(1);
    expect(submitReport).not.toHaveBeenCalled();
  });
});

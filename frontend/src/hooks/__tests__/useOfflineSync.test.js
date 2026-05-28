import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineSync } from '../useOfflineSync';
import {
  getAllQueuedItems,
  removeQueuedItem,
  setQueuedItemStatus,
  drainQueue,
} from '../../services/offlineQueue';

vi.mock('../../services/offlineQueue', () => ({
  getAllQueuedItems:   vi.fn(),
  removeQueuedItem:   vi.fn(),
  setQueuedItemStatus: vi.fn(),
  drainQueue:         vi.fn(),
}));

const PENDING_ITEM = {
  id: 'p1',
  status: 'pending',
  fields: { description: 'pending report' },
  createdAt: new Date().toISOString(),
  error: null,
};

const FAILED_ITEM = {
  id: 'f1',
  status: 'failed',
  fields: { description: 'failed report' },
  createdAt: new Date().toISOString(),
  error: 'server error',
};

beforeEach(() => {
  vi.clearAllMocks();
  getAllQueuedItems.mockResolvedValue([]);
  drainQueue.mockResolvedValue(0);
  removeQueuedItem.mockResolvedValue();
  setQueuedItemStatus.mockResolvedValue();
});

// ── Mount ─────────────────────────────────────────────────────────────────────

describe('useOfflineSync — mount', () => {
  it('loads queue items on mount', async () => {
    getAllQueuedItems.mockResolvedValue([PENDING_ITEM]);
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.queue).toHaveLength(1));
  });

  it('calls drainQueue on mount when online', async () => {
    renderHook(() => useOfflineSync());
    await waitFor(() => expect(drainQueue).toHaveBeenCalledTimes(1));
  });

  it('starts with isOnline reflecting navigator.onLine', () => {
    const { result } = renderHook(() => useOfflineSync());
    expect(result.current.isOnline).toBe(navigator.onLine);
  });

  it('starts with syncing false after drain completes', async () => {
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(drainQueue).toHaveBeenCalled());
    await waitFor(() => expect(result.current.syncing).toBe(false));
  });
});

// ── Online / offline events ───────────────────────────────────────────────────

describe('useOfflineSync — online/offline events', () => {
  it('triggers a drain when the online event fires', async () => {
    renderHook(() => useOfflineSync());
    await waitFor(() => expect(drainQueue).toHaveBeenCalledTimes(1));

    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(drainQueue).toHaveBeenCalledTimes(2));
  });

  it('sets isOnline=false when the offline event fires', () => {
    const { result } = renderHook(() => useOfflineSync());
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current.isOnline).toBe(false);
  });

  it('sets isOnline=true when the online event fires', async () => {
    const { result } = renderHook(() => useOfflineSync());
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current.isOnline).toBe(false);

    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current.isOnline).toBe(true);
  });
});

// ── discard ───────────────────────────────────────────────────────────────────

describe('useOfflineSync — discard', () => {
  it('calls removeQueuedItem with the given id', async () => {
    getAllQueuedItems.mockResolvedValue([PENDING_ITEM]);
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.queue).toHaveLength(1));

    await act(() => result.current.discard(PENDING_ITEM.id));
    expect(removeQueuedItem).toHaveBeenCalledWith(PENDING_ITEM.id);
  });

  it('refreshes the queue after discarding', async () => {
    getAllQueuedItems
      .mockResolvedValueOnce([PENDING_ITEM]) // initial refresh
      .mockResolvedValueOnce([PENDING_ITEM]) // refresh after drain
      .mockResolvedValue([]);                // refresh after discard

    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.queue).toHaveLength(1));

    await act(() => result.current.discard(PENDING_ITEM.id));
    await waitFor(() => expect(result.current.queue).toHaveLength(0));
  });
});

// ── retry ─────────────────────────────────────────────────────────────────────

describe('useOfflineSync — retry', () => {
  it('resets item status to pending', async () => {
    getAllQueuedItems.mockResolvedValue([FAILED_ITEM]);
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(drainQueue).toHaveBeenCalledTimes(1));

    await act(() => result.current.retry(FAILED_ITEM.id));
    expect(setQueuedItemStatus).toHaveBeenCalledWith(FAILED_ITEM.id, 'pending', null);
  });

  it('triggers a new drain after retry', async () => {
    getAllQueuedItems.mockResolvedValue([FAILED_ITEM]);
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(drainQueue).toHaveBeenCalledTimes(1));

    await act(() => result.current.retry(FAILED_ITEM.id));
    await waitFor(() => expect(drainQueue).toHaveBeenCalledTimes(2));
  });
});

// ── Derived state ─────────────────────────────────────────────────────────────

describe('useOfflineSync — derived state', () => {
  it('pendingCount excludes failed items', async () => {
    getAllQueuedItems.mockResolvedValue([PENDING_ITEM, FAILED_ITEM]);
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.queue).toHaveLength(2));
    expect(result.current.pendingCount).toBe(1);
  });

  it('failedItems returns only items with status "failed"', async () => {
    getAllQueuedItems.mockResolvedValue([PENDING_ITEM, FAILED_ITEM]);
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.queue).toHaveLength(2));
    expect(result.current.failedItems).toHaveLength(1);
    expect(result.current.failedItems[0].id).toBe(FAILED_ITEM.id);
  });

  it('pendingCount is 0 when queue is empty', async () => {
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(getAllQueuedItems).toHaveBeenCalled());
    expect(result.current.pendingCount).toBe(0);
  });
});

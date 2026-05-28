import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAllQueuedItems,
  removeQueuedItem,
  setQueuedItemStatus,
  drainQueue,
} from '../services/offlineQueue';

/**
 * Manages the offline report queue reactively.
 *
 * Triggers a drain on mount, on 'online' events, and when the tab
 * becomes visible again. On iOS (no Background Sync API), the drain
 * runs in the foreground whenever the user opens the app.
 */
export function useOfflineSync() {
  const [queue,    setQueue]    = useState([]);
  const [syncing,  setSyncing]  = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const draining = useRef(false);

  const refresh = useCallback(async () => {
    const items = await getAllQueuedItems();
    setQueue(items);
  }, []);

  const drain = useCallback(async () => {
    if (draining.current || !navigator.onLine) return;
    draining.current = true;
    setSyncing(true);
    try {
      await drainQueue();
    } finally {
      await refresh();
      setSyncing(false);
      draining.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    drain();

    const onOnline  = () => { setIsOnline(true);  drain(); };
    const onOffline = () =>   setIsOnline(false);
    const onVisible = () => { if (!document.hidden) drain(); };

    window.addEventListener('online',           onOnline);
    window.addEventListener('offline',          onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online',           onOnline);
      window.removeEventListener('offline',          onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [drain, refresh]);

  const discard = useCallback(async (id) => {
    await removeQueuedItem(id);
    await refresh();
  }, [refresh]);

  const retry = useCallback(async (id) => {
    await setQueuedItemStatus(id, 'pending', null);
    await refresh();
    drain(); // non-blocking — fires and updates via refresh in finally
  }, [drain, refresh]);

  return {
    queue,
    syncing,
    isOnline,
    pendingCount: queue.filter(i => i.status !== 'failed').length,
    failedItems:  queue.filter(i => i.status === 'failed'),
    syncNow:      drain,
    discard,
    retry,
    refresh,
  };
}

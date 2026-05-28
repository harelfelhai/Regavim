/**
 * Offline report queue backed by IndexedDB.
 *
 * Items are stored as { id, file: Blob, fields, createdAt, status, error }.
 * status transitions:
 *   'pending'   → waiting to be uploaded
 *   'uploading' → a drainQueue() call is actively sending this item
 *   'failed'    → server returned a 4xx; needs user attention (retry/edit/discard)
 *
 * The Blob is stored natively in IndexedDB — no base64 overhead.
 * navigator.storage.persist() is requested on first write so the browser
 * won't evict the queue under storage pressure.
 */

import { openDB } from 'idb';
import { submitReport } from './reports';

const DB_NAME  = 'regavim-offline';
const STORE    = 'queue';
const DB_VER   = 1;

function openQueue() {
  return openDB(DB_NAME, DB_VER, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' });
    },
  });
}

async function requestPersistence() {
  if (navigator.storage?.persist) {
    return navigator.storage.persist();
  }
  return false;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function enqueueReport(file, fields) {
  requestPersistence();
  const db   = await openQueue();
  const item = {
    id:        crypto.randomUUID(),
    file,
    fields,
    createdAt: new Date().toISOString(),
    status:    'pending',
    error:     null,
  };
  await db.put(STORE, item);
  return item.id;
}

export async function getAllQueuedItems() {
  const db = await openQueue();
  return db.getAll(STORE);
}

export async function removeQueuedItem(id) {
  const db = await openQueue();
  return db.delete(STORE, id);
}

export async function setQueuedItemStatus(id, status, error = null) {
  const db   = await openQueue();
  const item = await db.get(STORE, id);
  if (item) await db.put(STORE, { ...item, status, error });
}

// ── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Upload all pending queue items one-by-one.
 *
 * Network errors stop the loop (no point continuing offline) and reset
 * the item to 'pending' for the next attempt.
 * Server errors (4xx) mark the item as 'failed' — the user must review it.
 *
 * @returns {Promise<number>} number of items successfully uploaded
 */
export async function drainQueue() {
  const all     = await getAllQueuedItems();
  const pending = all.filter(i => i.status !== 'uploading');
  let uploaded  = 0;

  for (const item of pending) {
    await setQueuedItemStatus(item.id, 'uploading');
    try {
      await submitReport(item.file, item.fields);
      await removeQueuedItem(item.id);
      uploaded++;
    } catch (err) {
      if (err.isNetworkError || err.isTimeout) {
        await setQueuedItemStatus(item.id, 'pending');
        break; // network is down — stop trying
      }
      const msg =
        err.response?.data?.detail ??
        err.message ??
        'שגיאה לא ידועה';
      await setQueuedItemStatus(item.id, 'failed', msg);
    }
  }

  return uploaded;
}

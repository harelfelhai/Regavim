import { useState } from 'react';
import { Wifi, WifiOff, UploadCloud, AlertTriangle, Trash2, RefreshCw, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Displays the offline queue state in the sidebar.
 *
 * Props:
 *  queue        — full queue array from useOfflineSync
 *  syncing      — bool: drain is in progress
 *  isOnline     — bool: current network status
 *  onRetry(id)  — reset item to pending and trigger drain
 *  onDiscard(id)— remove item from queue
 *  onEdit(item) — open ReportForm pre-filled with this draft
 */
export default function OfflineQueue({ queue, syncing, isOnline, onRetry, onDiscard, onEdit }) {
  const [expanded, setExpanded] = useState(false);

  if (queue.length === 0 && isOnline) return null;

  const pending = queue.filter(i => i.status !== 'failed');
  const failed  = queue.filter(i => i.status === 'failed');

  return (
    <div className="border-t border-regavim-border flex-shrink-0" data-testid="offline-queue">
      {/* ── Header row ── */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          {/* Network indicator */}
          {isOnline ? (
            <Wifi size={13} className="text-green-500 flex-shrink-0" />
          ) : (
            <WifiOff size={13} className="text-amber-500 flex-shrink-0" />
          )}

          {/* Status text */}
          {syncing ? (
            <span className="text-regavim-blue font-medium flex items-center gap-1">
              <UploadCloud size={13} className="animate-pulse" />
              מסנכרן...
            </span>
          ) : failed.length > 0 ? (
            <span className="text-red-600 font-medium flex items-center gap-1">
              <AlertTriangle size={13} />
              {failed.length} דיווח{failed.length > 1 ? 'ים' : ''} נכשל{failed.length > 1 ? 'ו' : ''}
            </span>
          ) : pending.length > 0 ? (
            <span className="text-amber-600 font-medium">
              {pending.length} ממתין{pending.length > 1 ? 'ים' : ''} לשליחה
            </span>
          ) : !isOnline ? (
            <span className="text-gray-500">לא מחובר לרשת</span>
          ) : null}
        </div>

        {queue.length > 0 && (
          expanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />
        )}
      </button>

      {/* ── Expanded item list ── */}
      {expanded && queue.length > 0 && (
        <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
          {queue.map(item => (
            <li key={item.id} className="px-4 py-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-gray-700 font-medium truncate">
                    {item.fields.description || 'ללא תיאור'}
                  </p>
                  <p className="text-[10px] text-gray-400">{formatDate(item.createdAt)}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-medium rounded-full px-1.5 py-px ${
                  item.status === 'failed'    ? 'bg-red-100 text-red-600' :
                  item.status === 'uploading' ? 'bg-blue-100 text-blue-600' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {item.status === 'failed' ? 'נכשל' : item.status === 'uploading' ? 'שולח...' : 'ממתין'}
                </span>
              </div>

              {item.error && (
                <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">{item.error}</p>
              )}

              <div className="flex items-center gap-2">
                {item.status === 'failed' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onRetry(item.id)}
                      data-testid={`retry-${item.id}`}
                      className="flex items-center gap-1 text-[10px] text-regavim-blue hover:underline"
                    >
                      <RefreshCw size={10} />
                      נסה שוב
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      data-testid={`edit-${item.id}`}
                      className="flex items-center gap-1 text-[10px] text-gray-500 hover:underline"
                    >
                      <Pencil size={10} />
                      ערוך
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onDiscard(item.id)}
                  data-testid={`discard-${item.id}`}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 hover:underline ms-auto"
                >
                  <Trash2 size={10} />
                  מחק
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

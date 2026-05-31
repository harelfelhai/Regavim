import { useState, useEffect, useCallback } from 'react';
import { fetchReports } from '../services/reports';

/**
 * Fetches the report list and exposes loading / error state.
 * Re-fetches automatically when `filters` changes or when `refresh()` is called.
 * On network failure, retries up to 4 times with exponential backoff (1s, 2s, 4s, 8s)
 * so a sleeping Render free-tier instance wakes without requiring a manual refresh.
 * Also re-fetches automatically when the browser reports connection restored.
 */
export function useReports(filters = {}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Stable string key — effect only re-runs when filter values actually change.
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    let retryTimer = null;

    function attemptFetch(isRetry = false) {
      if (!isRetry) {
        setLoading(true);
        setError(null);
      }

      fetchReports(filters)
        .then((data) => {
          if (!cancelled) {
            setReports(data);
            setLoading(false);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err);
            setLoading(false);
            // Retry only on transient network/timeout errors, up to 4 extra attempts.
            if ((err.isNetworkError || err.isTimeout) && retryCount < 4) {
              const delay = Math.pow(2, retryCount) * 1000;
              retryCount += 1;
              retryTimer = setTimeout(() => {
                if (!cancelled) attemptFetch(true);
              }, delay);
            }
          }
        });
    }

    attemptFetch();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  // filterKey is the serialized form of filters; tick forces a manual refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, tick]);

  // Auto-refresh when the browser reports connection restored.
  useEffect(() => {
    const onOnline = () => refresh();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  return { reports, loading, error, refresh };
}

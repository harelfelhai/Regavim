import { useState, useEffect, useCallback } from 'react';
import { fetchReports } from '../services/reports';

/**
 * Fetches the report list and exposes loading / error state.
 * Re-fetches automatically when `filters` changes (compared by value via JSON.stringify)
 * or when `refresh()` is called manually. The request is cancelled on unmount.
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
    setLoading(true);
    setError(null);

    fetchReports(filters)
      .then((data) => {
        if (!cancelled) {
          setReports(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  // filterKey is the serialized form of filters; tick forces a manual refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, tick]);

  return { reports, loading, error, refresh };
}

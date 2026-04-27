import { useState, useEffect } from 'react';
import { fetchReports } from '../services/reports';

/**
 * Fetches the report list on mount and exposes loading / error state.
 * The request is cancelled (result discarded) if the component unmounts
 * before it completes, preventing state updates on dead components.
 */
export function useReports(filters = {}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { reports, loading, error };
}

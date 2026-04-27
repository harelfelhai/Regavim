import { useState, useEffect } from 'react';
import { fetchReport, patchReport } from '../services/reports';

export function useReportDetail(reportId, { onPatched } = {}) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [patching, setPatching] = useState(false);
  const [patchError, setPatchError] = useState(null);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchReport(reportId)
      .then((data) => {
        if (!cancelled) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load report');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  async function confirmCategory(finalCategory) {
    if (!reportId) return false;
    setPatching(true);
    setPatchError(null);

    try {
      const updated = await patchReport(reportId, { final_category: finalCategory });
      setReport(updated);
      onPatched?.();
      return true;
    } catch (err) {
      setPatchError(err?.message ?? 'Update failed. Please try again.');
      return false;
    } finally {
      setPatching(false);
    }
  }

  return { report, loading, error, patching, patchError, confirmCategory };
}

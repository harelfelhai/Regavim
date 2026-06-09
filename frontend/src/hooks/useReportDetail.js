import { useState, useEffect, useCallback } from 'react';
import {
  fetchReport,
  patchReport,
  deleteReport,
  fetchComplaints,
  submitComplaint as submitComplaintApi,
} from '../services/reports';

export function useReportDetail(reportId, { onPatched } = {}) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [patching, setPatching] = useState(false);
  const [patchError, setPatchError] = useState(null);
  const [complaints, setComplaints] = useState([]);

  const refreshComplaints = useCallback(() => {
    if (!reportId) return;
    fetchComplaints(reportId)
      .then(setComplaints)
      .catch(() => setComplaints([]));
  }, [reportId]);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      setComplaints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setComplaints([]);

    fetchReport(reportId)
      .then((data) => {
        if (!cancelled) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'שגיאה בטעינת הדיווח');
          setLoading(false);
        }
      });

    fetchComplaints(reportId)
      .then((data) => { if (!cancelled) setComplaints(data); })
      .catch(() => { if (!cancelled) setComplaints([]); });

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
      setPatchError(err?.message ?? 'העדכון נכשל. נסה/י שנית.');
      return false;
    } finally {
      setPatching(false);
    }
  }

  async function requestDeletion() {
    if (!reportId) return false;
    setPatching(true);
    setPatchError(null);

    try {
      const updated = await patchReport(reportId, { status: 'deletion_requested' });
      setReport(updated);
      onPatched?.();
      return true;
    } catch (err) {
      setPatchError(err?.message ?? 'הבקשה נכשלה. נסה/י שנית.');
      return false;
    } finally {
      setPatching(false);
    }
  }

  async function hardDeleteReport() {
    if (!reportId) return false;
    setPatching(true);
    setPatchError(null);

    try {
      await deleteReport(reportId, { force: true });
      onPatched?.();
      return true;
    } catch (err) {
      setPatchError(err?.message ?? 'המחיקה נכשלה. נסה/י שנית.');
      return false;
    } finally {
      setPatching(false);
    }
  }

  async function rejectReport() {
    if (!reportId) return false;
    setPatching(true);
    setPatchError(null);

    try {
      const updated = await patchReport(reportId, { status: 'rejected' });
      setReport(updated);
      onPatched?.();
      return true;
    } catch (err) {
      setPatchError(err?.message ?? 'הדחייה נכשלה. נסה/י שנית.');
      return false;
    } finally {
      setPatching(false);
    }
  }

  async function saveTags(tags) {
    if (!reportId) return false;
    setPatching(true);
    setPatchError(null);

    try {
      const updated = await patchReport(reportId, { tags });
      setReport(updated);
      onPatched?.();
      return true;
    } catch (err) {
      setPatchError(err?.message ?? 'שמירת התגיות נכשלה. נסה/י שנית.');
      return false;
    } finally {
      setPatching(false);
    }
  }

  async function submitComplaint(authorityKeys) {
    if (!reportId || !authorityKeys?.length) return false;
    setPatching(true);
    setPatchError(null);

    try {
      const { results } = await submitComplaintApi(reportId, authorityKeys);
      refreshComplaints();
      return results;
    } catch (err) {
      setPatchError(err?.message ?? 'הגשת התלונה נכשלה. נסה/י שנית.');
      return false;
    } finally {
      setPatching(false);
    }
  }

  return {
    report, loading, error, patching, patchError,
    confirmCategory, requestDeletion, rejectReport, hardDeleteReport, saveTags,
    complaints, submitComplaint,
  };
}

import { useState, useRef, useEffect } from 'react';
import { submitReport } from '../services/reports';
import { enqueueReport } from '../services/offlineQueue';
import useAuthStore from '../store/authStore';

export const STEP = {
  IDLE:       'idle',
  READY:      'ready',
  ERROR:      'error',
  SUBMITTING: 'submitting',
  DONE:       'done',
  QUEUED:     'queued', // saved locally; will upload when back online
};

/**
 * Manages the full create-report flow:
 *   idle → ready (file stored locally, metadata captured)
 *        → submitting (atomic upload+create in one request)
 *        → done   — server accepted the report
 *        → queued — network was unavailable; payload saved to IndexedDB
 *                   and will be retried automatically on reconnect
 *
 * No network call is made until the user explicitly submits. This makes
 * offline buffering straightforward: handleSubmit enqueues the payload
 * locally on any network failure and transitions to QUEUED so the caller
 * can show the appropriate success message.
 */
export function useReportForm() {
  const [step, setStep]               = useState(STEP.IDLE);
  const [imagePreview, setImagePreview] = useState(null);
  const [reportId, setReportId]       = useState(null);
  const [error, setError]             = useState(null);

  const fileRef = useRef(null);
  const metaRef = useRef({});

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  /**
   * Store the chosen file locally and show a preview.
   * No network call is made here — upload happens at submit time.
   *
   * @param {File}   file
   * @param {Object} meta - { userLat, userLng, targetLat, targetLng, observedAt }
   */
  function handleFileChange(file, meta = {}) {
    fileRef.current = file;
    metaRef.current = meta;
    setImagePreview(URL.createObjectURL(file));
    setStep(STEP.READY);
    setError(null);
  }

  /**
   * Upload image and create report atomically.
   *
   * On success → DONE.
   * On network failure → payload is queued in IndexedDB → QUEUED.
   * On server error (4xx/5xx) → ERROR with message.
   */
  async function handleSubmit({ description, finalCategory, tags }) {
    if (!fileRef.current) return false;
    setStep(STEP.SUBMITTING);
    setError(null);

    const { userLat, userLng, targetLat, targetLng, observedAt } = metaRef.current;
    const fields = {
      description,
      finalCategory,
      tags,
      userLat,
      userLng,
      targetLat,
      targetLng,
      observedAt,
    };

    // Guest users (no token) go straight to the offline queue; the item
    // will be drained automatically after they log in.
    if (!useAuthStore.getState().token) {
      try {
        await enqueueReport(fileRef.current, fields);
        setStep(STEP.QUEUED);
        return 'queued';
      } catch {
        setError('לא ניתן לשמור. בדוק/י שיש מספיק מקום פנוי.');
        setStep(STEP.ERROR);
        return false;
      }
    }

    try {
      const report = await submitReport(fileRef.current, fields);
      setReportId(report.id);
      setStep(STEP.DONE);
      return true;
    } catch (err) {
      if (!navigator.onLine || err.isNetworkError || err.isTimeout) {
        try {
          await enqueueReport(fileRef.current, fields);
          setStep(STEP.QUEUED);
          return 'queued';
        } catch {
          setError('לא ניתן לשמור. בדוק/י שיש מספיק מקום פנוי.');
          setStep(STEP.ERROR);
          return false;
        }
      }
      setError(err?.message ?? 'השליחה נכשלה. נסה/י שנית.');
      setStep(STEP.ERROR);
      return false;
    }
  }

  function reset() {
    setStep(STEP.IDLE);
    setImagePreview(null);
    setReportId(null);
    setError(null);
    fileRef.current = null;
    metaRef.current = {};
  }

  function cancelAndCleanup() {
    reset();
  }

  return {
    step,
    imagePreview,
    error,
    reportId,
    handleFileChange,
    handleSubmit,
    reset,
    cancelAndCleanup,
  };
}

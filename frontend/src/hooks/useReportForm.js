import { useState, useRef, useEffect } from 'react';
import { submitReport } from '../services/reports';

export const STEP = {
  IDLE:       'idle',
  READY:      'ready',
  ERROR:      'error',
  SUBMITTING: 'submitting',
  DONE:       'done',
};

/**
 * Manages the full create-report flow:
 *   idle → ready (file stored locally, metadata captured)
 *        → submitting (atomic upload+create in one request)
 *        → done
 *
 * The file is never uploaded until the user explicitly submits. This makes
 * offline buffering straightforward: the outbox layer (PR2) can store
 * { file, fields } in IndexedDB and replay submitReport() on reconnect.
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
   * Transitions: READY → SUBMITTING → DONE (or ERROR).
   */
  async function handleSubmit({ description, finalCategory, tags }) {
    if (!fileRef.current) return false;
    setStep(STEP.SUBMITTING);
    setError(null);

    const { userLat, userLng, targetLat, targetLng, observedAt } = metaRef.current;

    try {
      const report = await submitReport(fileRef.current, {
        description,
        finalCategory,
        tags,
        userLat,
        userLng,
        targetLat,
        targetLng,
        observedAt,
      });
      setReportId(report.id);
      setStep(STEP.DONE);
      return true;
    } catch (err) {
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

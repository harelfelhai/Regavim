import { useState, useEffect } from 'react';
import { createReport, patchReport, deleteReport } from '../services/reports';
import { uploadImage, analyzeImage } from '../services/images';

export const STEP = {
  IDLE:        'idle',
  UPLOADING:   'uploading',
  ANALYZING:   'analyzing',
  READY:       'ready',
  ERROR:       'error',
  SUBMITTING:  'submitting',
  DONE:        'done',
};

/**
 * Manages the full create-report flow:
 *   idle → uploading (create report + upload image)
 *        → analyzing (call Claude)
 *        → ready (show AI suggestion)
 *        → submitting (PATCH report with description + final_category)
 *        → done
 *
 * handleFileChange accepts an optional `meta` object from the form component
 * containing GPS coordinates and observed_at captured before the upload starts.
 */
export function useReportForm() {
  const [step, setStep]               = useState(STEP.IDLE);
  const [imagePreview, setImagePreview] = useState(null);
  const [reportId, setReportId]       = useState(null);
  const [aiCategory, setAiCategory]   = useState(null);
  const [analysisAvailable, setAnalysisAvailable] = useState(false);
  const [error, setError]             = useState(null);

  // Revoke the blob URL when it changes or the hook unmounts.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  /**
   * Called once the user has chosen a file AND (for gallery mode) answered the
   * location/time questions. `meta` carries coordinates and observed_at so they
   * are stored on the record at creation time.
   *
   * @param {File}   file
   * @param {Object} meta - { userLat, userLng, targetLat, targetLng, observedAt }
   */
  async function handleFileChange(file, meta = {}) {
    const {
      userLat    = null,
      userLng    = null,
      targetLat  = null,
      targetLng  = null,
      observedAt = null,
    } = meta;

    setImagePreview(URL.createObjectURL(file));
    setStep(STEP.UPLOADING);
    setError(null);
    setAiCategory(null);

    // Local var so the catch block references it even before setReportId settles.
    let createdReportId = null;

    try {
      // Build only the fields that have values so createReport({}) still works
      // for the no-meta case (backward-compatible with existing tests).
      const createPayload = {};
      if (userLat    !== null) createPayload.user_lat    = userLat;
      if (userLng    !== null) createPayload.user_lng    = userLng;
      if (targetLat  !== null) createPayload.target_lat  = targetLat;
      if (targetLng  !== null) createPayload.target_lng  = targetLng;
      if (observedAt !== null) createPayload.observed_at = observedAt;

      // Create as a draft: the report stays hidden from the map/list until the
      // reporter submits, and a hard-refresh mid-flow leaves a removable draft
      // rather than a half-finished visible report.
      const report = await createReport(createPayload, { draft: true });
      createdReportId = report.id;
      setReportId(report.id);

      const image = await uploadImage(report.id, file);

      setStep(STEP.ANALYZING);
      const analysis = await analyzeImage(image.id);

      setAiCategory(analysis.ai_category);
      setAnalysisAvailable(analysis.analysis_available);
      setStep(STEP.READY);
    } catch (err) {
      setError(err?.message ?? 'ההעלאה נכשלה. נסה/י שנית.');
      setStep(STEP.ERROR);
      // Best-effort cleanup: hard-delete if no image attached yet, else soft-delete.
      if (createdReportId) {
        deleteReport(createdReportId, { force: true }).catch(() => {
          deleteReport(createdReportId).catch(() => {});
        });
      }
    }
  }

  /**
   * Finalises the report with the coordinator's description, chosen category, and tags.
   */
  async function handleSubmit({ description, finalCategory, tags }) {
    if (!reportId) return;
    setStep(STEP.SUBMITTING);
    setError(null);

    try {
      const payload = { description, status: 'confirmed' };
      if (finalCategory) payload.final_category = finalCategory;
      if (Array.isArray(tags)) payload.tags = tags;
      await patchReport(reportId, payload);
      setStep(STEP.DONE);
    } catch (err) {
      setError(err?.message ?? 'השליחה נכשלה. נסה/י שנית.');
      setStep(STEP.ERROR);
    }
  }

  function reset() {
    setStep(STEP.IDLE);
    setImagePreview(null);
    setReportId(null);
    setAiCategory(null);
    setAnalysisAvailable(false);
    setError(null);
  }

  /**
   * Cancel the flow and clean up any draft record on the server.
   * Hard-deletes if no image is attached yet; falls back to soft-delete.
   */
  function cancelAndCleanup() {
    const currentId = reportId;
    reset();
    if (currentId) {
      deleteReport(currentId, { force: true }).catch(() => {
        deleteReport(currentId).catch(() => {});
      });
    }
  }

  return {
    step,
    imagePreview,
    aiCategory,
    analysisAvailable,
    error,
    reportId,
    handleFileChange,
    handleSubmit,
    reset,
    cancelAndCleanup,
  };
}

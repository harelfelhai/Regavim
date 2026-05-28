import { useState, useRef, useEffect } from 'react';
import { createReport } from '../services/reports';
import { uploadImage, analyzeImage, deleteImage } from '../services/images';

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
 *   idle → uploading (upload a STAGED image — no report yet)
 *        → analyzing (call Claude)
 *        → ready (show AI suggestion)
 *        → submitting (create the report and link the staged image)
 *        → done
 *
 * Nothing is persisted as a report until the user submits. The image is staged
 * (report_id = null) during upload/analysis; if the flow is abandoned the staged
 * image is deleted (best-effort) and, as a safety net, reaped server-side later.
 *
 * handleFileChange accepts an optional `meta` object from the form component
 * containing GPS coordinates and observed_at; these are held until submit and
 * sent when the report is created.
 */
export function useReportForm() {
  const [step, setStep]               = useState(STEP.IDLE);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageId, setImageId]         = useState(null);
  const [reportId, setReportId]       = useState(null);
  const [aiCategory, setAiCategory]   = useState(null);
  const [analysisAvailable, setAnalysisAvailable] = useState(false);
  const [error, setError]             = useState(null);

  // Metadata captured at file-pick time, carried until the report is created.
  const metaRef = useRef({});

  // Revoke the blob URL when it changes or the hook unmounts.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  /**
   * Upload the chosen file as a staged image and run AI analysis. No report is
   * created here. `meta` is stored for use at submit time.
   *
   * @param {File}   file
   * @param {Object} meta - { userLat, userLng, targetLat, targetLng, observedAt }
   */
  async function handleFileChange(file, meta = {}) {
    metaRef.current = meta;

    setImagePreview(URL.createObjectURL(file));
    setStep(STEP.UPLOADING);
    setError(null);
    setAiCategory(null);

    let uploadedImageId = null;

    try {
      const image = await uploadImage(file);
      uploadedImageId = image.id;
      setImageId(image.id);

      setStep(STEP.ANALYZING);
      const analysis = await analyzeImage(image.id);

      setAiCategory(analysis.ai_category);
      setAnalysisAvailable(analysis.analysis_available);
      setStep(STEP.READY);
    } catch (err) {
      setError(err?.message ?? 'ההעלאה נכשלה. נסה/י שנית.');
      setStep(STEP.ERROR);
      // Best-effort cleanup of the staged image (reaper is the safety net).
      if (uploadedImageId) {
        deleteImage(uploadedImageId).catch(() => {});
        setImageId(null);
      }
    }
  }

  /**
   * Create the report in one atomic step — coordinates + observed_at (from the
   * earlier file-pick), plus the coordinator's description, category, and tags —
   * and link the staged image. This is the FIRST time anything is saved.
   */
  async function handleSubmit({ description, finalCategory, tags }) {
    if (!imageId) return;
    setStep(STEP.SUBMITTING);
    setError(null);

    const { userLat, userLng, targetLat, targetLng, observedAt } = metaRef.current;
    const payload = { description, image_id: imageId };
    if (userLat    != null) payload.user_lat    = userLat;
    if (userLng    != null) payload.user_lng    = userLng;
    if (targetLat  != null) payload.target_lat  = targetLat;
    if (targetLng  != null) payload.target_lng  = targetLng;
    if (observedAt != null) payload.observed_at = observedAt;
    if (finalCategory)      payload.final_category = finalCategory;
    if (Array.isArray(tags)) payload.tags = tags;

    try {
      const report = await createReport(payload);
      setReportId(report.id);
      // The image is now linked — clear so cleanup never deletes it.
      setImageId(null);
      setStep(STEP.DONE);
    } catch (err) {
      setError(err?.message ?? 'השליחה נכשלה. נסה/י שנית.');
      setStep(STEP.ERROR);
    }
  }

  function reset() {
    setStep(STEP.IDLE);
    setImagePreview(null);
    setImageId(null);
    setReportId(null);
    setAiCategory(null);
    setAnalysisAvailable(false);
    setError(null);
    metaRef.current = {};
  }

  /**
   * Cancel the flow and clean up the staged image if it was never linked.
   */
  function cancelAndCleanup() {
    const stagedId = imageId;
    reset();
    if (stagedId) {
      deleteImage(stagedId).catch(() => {});
    }
  }

  return {
    step,
    imagePreview,
    aiCategory,
    analysisAvailable,
    error,
    imageId,
    reportId,
    handleFileChange,
    handleSubmit,
    reset,
    cancelAndCleanup,
  };
}

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
 * URL.createObjectURL produces a local blob URL for instant preview.
 * The object URL is revoked on cleanup to avoid memory leaks.
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
   * Called as soon as the user picks a file.
   * Creates the preview and kicks off the upload → analyze pipeline.
   */
  async function handleFileChange(file) {
    setImagePreview(URL.createObjectURL(file));
    setStep(STEP.UPLOADING);
    setError(null);
    setAiCategory(null);

    // Local variable so the catch block can reference it even before setReportId settles.
    let createdReportId = null;

    try {
      // Step 1 — create an empty draft report to get a report_id.
      const report = await createReport({});
      createdReportId = report.id;
      setReportId(report.id);

      // Step 2 — upload the image to that report.
      const image = await uploadImage(report.id, file);

      // Step 3 — send the stored image to Claude for classification.
      setStep(STEP.ANALYZING);
      const analysis = await analyzeImage(image.id);

      setAiCategory(analysis.ai_category);
      setAnalysisAvailable(analysis.analysis_available);
      setStep(STEP.READY);
    } catch (err) {
      setError(err?.message ?? 'Upload failed. Please try again.');
      setStep(STEP.ERROR);
      // Best-effort cleanup: hard-delete the draft (no images) or soft-delete
      // if an image was already attached before the failure.
      if (createdReportId) {
        deleteReport(createdReportId, { force: true }).catch(() => {
          deleteReport(createdReportId).catch(() => {});
        });
      }
    }
  }

  /**
   * Finalises the report with the coordinator's description and chosen category.
   * Sets status → confirmed via the backend auto-confirm rule.
   */
  async function handleSubmit({ description, finalCategory }) {
    if (!reportId) return;
    setStep(STEP.SUBMITTING);
    setError(null);

    try {
      const payload = { description, status: 'confirmed' };
      if (finalCategory) payload.final_category = finalCategory;
      await patchReport(reportId, payload);
      setStep(STEP.DONE);
    } catch (err) {
      setError(err?.message ?? 'Submit failed. Please try again.');
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
   * Cancel the current flow and clean up any draft record that was already
   * created on the server. Hard-deletes if no image is attached yet; falls
   * back to soft-delete (rejected) otherwise. Both are best-effort.
   */
  function cancelAndCleanup() {
    const currentId = reportId; // capture before reset() clears it
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

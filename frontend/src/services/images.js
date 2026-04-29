import api from './api';

/**
 * Construct the URL for serving the original image binary.
 * Uses the same base URL as the Axios instance so it works in all environments.
 *
 * @param {string} imageId - ID returned by uploadImage
 * @returns {string} URL suitable for <img src="...">
 */
export function getImageFileUrl(imageId) {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
  return `${base}/api/v1/images/${imageId}/file`;
}

/**
 * Upload an image file and attach it to an existing report.
 * Uses multipart/form-data — axios detects FormData and sets the boundary header.
 *
 * @param {string} reportId  - ID of the report to attach the image to
 * @param {File}   file      - The image file chosen by the user
 * @returns {Promise<Object>} ImageRead — includes `id` (image_id) and `has_exif`
 */
export async function uploadImage(reportId, file) {
  const formData = new FormData();
  formData.append('report_id', reportId);
  formData.append('file', file);
  // Override the 10 s instance default: large images (up to 10 MB) need more
  // time on slow connections. 60 s covers 10 MB at ~1.4 Mbps with headroom.
  const { data } = await api.post('/api/v1/images/upload', formData, {
    timeout: 60_000,
  });
  return data;
}

/**
 * Submit an already-uploaded image to Claude for violation category suggestion.
 * The backend reads the file from disk using image_id — the file must exist first.
 *
 * @param {string} imageId - ID returned by uploadImage
 * @returns {Promise<Object>} AnalysisResult — `{ ai_category, analysis_available }`
 */
export async function analyzeImage(imageId) {
  const formData = new FormData();
  formData.append('image_id', imageId);
  const { data } = await api.post('/api/v1/images/analyze', formData);
  return data;
}

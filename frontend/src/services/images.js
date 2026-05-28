import api from './api';

/**
 * Construct the URL for serving the original image binary.
 * Returns a path relative to VITE_API_BASE_URL (empty in dev → Vite proxy).
 * The file endpoint is unauthenticated by design (relies on the UUID being
 * unguessable) so an <img src="..."> tag can load it directly.
 *
 * @param {string} imageId - ID returned by uploadImage
 * @returns {string} URL suitable for <img src="...">
 */
export function getImageFileUrl(imageId) {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  return `${base}/api/v1/images/${imageId}/file`;
}

/**
 * Upload an image file as a staged image (not yet linked to any report).
 * The report is created later, on submit, and the image is linked then.
 * Uses multipart/form-data — axios detects FormData and sets the boundary header.
 *
 * @param {File} file - The image file chosen by the user
 * @returns {Promise<Object>} ImageRead — includes `id` (image_id) and `has_exif`
 */
export async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  // Override the 10 s instance default. 120 s covers up to 10 MB on slow
  // mobile uplinks (~700 Kbps) with comfortable headroom for handshake and
  // EXIF processing on the server.
  const { data } = await api.post('/api/v1/images/upload', formData, {
    timeout: 120_000,
  });
  return data;
}

/**
 * Delete a staged image that was never linked to a report — used to clean up
 * when the user abandons the create flow. Best-effort; a 409 (already linked)
 * or 404 is ignored by callers.
 *
 * @param {string} imageId - ID returned by uploadImage
 */
export async function deleteImage(imageId) {
  await api.delete(`/api/v1/images/${imageId}`);
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
  // Claude vision can take 15-40 s on a large image. The 10 s axios default
  // was triggering false timeouts on perfectly valid uploads. 90 s leaves
  // ample headroom while still bounding the wait if the API is wedged.
  const { data } = await api.post('/api/v1/images/analyze', formData, {
    timeout: 90_000,
  });
  return data;
}

import api from './api';

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
  const { data } = await api.post('/api/v1/images/upload', formData);
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

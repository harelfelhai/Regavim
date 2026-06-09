import api from './api';

/**
 * Fetch all reports, optionally filtered.
 * @param {Object} filters - status, category, tag, date_from, date_to, reporter_id
 */
export async function fetchReports(filters = {}) {
  const { data } = await api.get('/api/v1/reports/', { params: filters });
  return data;
}

/**
 * Fetch distinct tags used across all reports, optionally filtered by a partial string.
 * Used for TagInput autocomplete.
 * @param {string} [q] - Partial tag string to search
 * @returns {Promise<string[]>}
 */
export async function fetchTags(q = '') {
  const { data } = await api.get('/api/v1/reports/tags', { params: q ? { q } : {} });
  return data;
}

/**
 * Fetch a single report by ID.
 * @param {string} id - Report UUID
 */
export async function fetchReport(id) {
  const { data } = await api.get(`/api/v1/reports/${id}`);
  return data;
}

/**
 * Create a report. Nothing is persisted before this call — the multi-step flow
 * uploads and analyses the image first, then submits everything here at once.
 * @param {Object} payload - ReportCreate fields (description, coordinates,
 *   land_context, tags, final_category, image_id)
 */
export async function createReport(payload = {}) {
  const { data } = await api.post('/api/v1/reports/', payload);
  return data;
}

/**
 * Atomic submit: upload image and create report in one multipart request.
 * Used by the offline-capable create flow — the file and all metadata travel
 * together so the client can buffer the full payload locally while offline
 * and replay it in a single call on reconnect.
 *
 * @param {File}   file
 * @param {Object} fields - { description, finalCategory, tags, userLat,
 *   userLng, targetLat, targetLng, observedAt }
 * @returns {Promise<Object>} ReportRead
 */
export async function submitReport(file, fields = {}) {
  const fd = new FormData();
  fd.append('file', file);
  if (fields.description)              fd.append('description',    fields.description);
  if (fields.finalCategory)            fd.append('final_category', fields.finalCategory);
  if (fields.userLat    != null)       fd.append('user_lat',       String(fields.userLat));
  if (fields.userLng    != null)       fd.append('user_lng',       String(fields.userLng));
  if (fields.targetLat  != null)       fd.append('target_lat',     String(fields.targetLat));
  if (fields.targetLng  != null)       fd.append('target_lng',     String(fields.targetLng));
  if (fields.observedAt)               fd.append('observed_at',    fields.observedAt);
  if (fields.tags?.length)             fd.append('tags',           JSON.stringify(fields.tags));

  const { data } = await api.post('/api/v1/reports/submit', fd, { timeout: 120_000 });
  return data;
}

/**
 * Update mutable fields on an existing report (description, status, final_category, land_context).
 * Sending read-only fields (ai_category, user_id, coordinates) returns 422.
 * @param {string} id      - Report UUID
 * @param {Object} payload - ReportUpdate fields
 */
export async function patchReport(id, payload) {
  const { data } = await api.patch(`/api/v1/reports/${id}`, payload);
  return data;
}

/**
 * Delete a report.
 * Without force: soft-delete (status → rejected). Row retained for audit.
 * With force:    hard-delete. Only allowed for pending reports with no images.
 * @param {string}  id           - Report UUID
 * @param {Object}  options
 * @param {boolean} options.force - Hard-delete draft with no images (default false)
 */
export async function deleteReport(id, { force = false } = {}) {
  await api.delete(`/api/v1/reports/${id}`, {
    params: force ? { force: 'true' } : undefined,
  });
}

/**
 * List the authorities a complaint can be filed to.
 * @returns {Promise<Array<{key: string, label: string, available: boolean}>>}
 */
export async function fetchComplaintAuthorities() {
  const { data } = await api.get('/api/v1/complaints/authorities');
  return data;
}

/**
 * Fetch the complaint submission history for a report (newest first).
 * @param {string} reportId - Report UUID
 */
export async function fetchComplaints(reportId) {
  const { data } = await api.get(`/api/v1/reports/${reportId}/complaints`);
  return data;
}

/**
 * Submit a report as a complaint to one or more authorities.
 * @param {string}   reportId    - Report UUID
 * @param {string[]} authorities - Authority keys (e.g. ['POLICE', 'ILA'])
 * @returns {Promise<{results: Array<{authority_key, authority_label, status, error_message}>}>}
 */
export async function submitComplaint(reportId, authorities) {
  const { data } = await api.post(`/api/v1/reports/${reportId}/complaints`, { authorities });
  return data;
}

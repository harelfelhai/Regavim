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
 * Open a new report. All fields optional — an empty report is valid.
 * @param {Object}  payload        - ReportCreate fields (description, coordinates, land_context)
 * @param {Object}  options
 * @param {boolean} options.draft  - Create as a hidden draft (default false). The
 *   multi-step create flow uses this so the report stays invisible until the
 *   reporter submits, and an abandoned flow can be hard-deleted.
 */
export async function createReport(payload = {}, { draft = false } = {}) {
  const { data } = await api.post('/api/v1/reports/', payload, {
    params: draft ? { draft: 'true' } : undefined,
  });
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

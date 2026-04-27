import api from './api';

/**
 * Fetch all reports, optionally filtered.
 * @param {Object} filters - status, category, date_from, date_to, reporter_id
 */
export async function fetchReports(filters = {}) {
  const { data } = await api.get('/api/v1/reports/', { params: filters });
  return data;
}

/**
 * Open a new report. All fields optional — an empty report is valid.
 * @param {Object} payload - ReportCreate fields (description, coordinates, land_context)
 */
export async function createReport(payload = {}) {
  const { data } = await api.post('/api/v1/reports/', payload);
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

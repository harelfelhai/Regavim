import api from './api';

/**
 * Fetch all reports from the backend, optionally filtered.
 * @param {Object} filters - Query params matching the backend filter contract
 *   (status, category, date_from, date_to, reporter_id)
 * @returns {Promise<Array>} resolved with the reports array
 */
export async function fetchReports(filters = {}) {
  const { data } = await api.get('/api/v1/reports/', { params: filters });
  return data;
}

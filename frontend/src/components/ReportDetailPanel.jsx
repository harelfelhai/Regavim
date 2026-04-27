import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  MapPin,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useReportDetail } from '../hooks/useReportDetail';
import { getImageFileUrl } from '../services/images';

const CATEGORIES = [
  'ILLEGAL_CONSTRUCTION',
  'LAND_GRADING',
  'AGRICULTURAL_ENCROACHMENT',
  'ROAD_PAVING',
  'DEMOLITION',
  'ILLEGAL_DUMPING',
  'OTHER',
];

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-gray-100 text-gray-500',
};

const EDITABLE_STATUSES = new Set(['pending', 'confirmed']);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCategory(cat) {
  return cat ? cat.replace(/_/g, ' ') : '—';
}

export default function ReportDetailPanel({ reportId, onBack, onPatched }) {
  const [confirmValue, setConfirmValue] = useState('');

  // Reset local category selection when the selected report changes.
  useEffect(() => {
    setConfirmValue('');
  }, [reportId]);

  const { report, loading, error, patching, patchError, confirmCategory } =
    useReportDetail(reportId, { onPatched });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-32 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 text-red-600 text-sm">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!report) return null;

  const badgeClass = STATUS_BADGE[report.status] ?? STATUS_BADGE.pending;
  const canConfirm = EDITABLE_STATUSES.has(report.status);
  const firstImageId = report.image_ids?.[0];
  const displayCategory = confirmValue || report.final_category || report.ai_category || '';

  async function handleConfirm(e) {
    e.preventDefault();
    if (!displayCategory) return;
    const ok = await confirmCategory(displayCategory);
    if (ok) setConfirmValue('');
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-regavim-border sticky top-0 bg-white z-10">
        <button
          onClick={onBack}
          aria-label="Back to list"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium capitalize ${badgeClass}`}>
          {report.status}
        </span>
      </div>

      {/* Evidence image */}
      {firstImageId && (
        <div className="w-full flex-shrink-0">
          <img
            src={getImageFileUrl(firstImageId)}
            alt="Report evidence"
            className="w-full object-cover max-h-52"
            data-testid="report-image"
          />
        </div>
      )}

      {/* Metadata */}
      <div className="px-4 py-4 space-y-3 flex-1">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Date reported</p>
          <p className="text-sm text-gray-800">{formatDate(report.created_at)}</p>
        </div>

        {report.description && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Description</p>
            <p className="text-sm text-gray-700">{report.description}</p>
          </div>
        )}

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-regavim-blue mb-1">
            <Sparkles size={13} />
            <span className="text-xs font-semibold uppercase tracking-wide">AI Analysis</span>
          </div>
          <p className="text-xs text-gray-600">
            Suggested:{' '}
            <span className="font-medium text-gray-800">
              {formatCategory(report.ai_category)}
            </span>
          </p>
        </div>

        {report.final_category && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Confirmed category</p>
            <p className="text-sm font-medium text-gray-800">
              {formatCategory(report.final_category)}
            </p>
          </div>
        )}

        {report.target_lat != null && report.target_lng != null && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <MapPin size={12} className="text-regavim-blue flex-shrink-0" />
            <span>
              {report.target_lat.toFixed(5)}°, {report.target_lng.toFixed(5)}°
            </span>
          </div>
        )}
      </div>

      {/* Confirmation section — only for actionable statuses */}
      {canConfirm && (
        <div className="border-t border-regavim-border px-4 py-4 flex-shrink-0">
          <p className="text-xs font-medium text-gray-600 mb-2">Set final category</p>
          <form onSubmit={handleConfirm} className="space-y-2" data-testid="confirm-form">
            <select
              aria-label="Final category"
              value={displayCategory}
              onChange={(e) => setConfirmValue(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
            >
              <option value="">— select a category —</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {formatCategory(cat)}
                </option>
              ))}
            </select>

            {patchError && (
              <p role="alert" className="text-xs text-red-600">
                {patchError}
              </p>
            )}

            <button
              type="submit"
              disabled={!displayCategory || patching}
              className="w-full rounded-lg bg-regavim-blue text-white py-2 text-sm font-semibold hover:bg-regavim-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {patching ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </span>
              ) : (
                'Confirm Category'
              )}
            </button>
          </form>
        </div>
      )}

      {/* Approved: read-only confirmation display */}
      {!canConfirm && report.status === 'approved' && (
        <div className="border-t border-regavim-border px-4 py-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle2 size={15} />
            <span>
              Approved:{' '}
              <span className="font-medium">{formatCategory(report.final_category)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

import { MapPin, AlertCircle, Loader2 } from 'lucide-react';

const STATUS_BADGE = {
  pending:   'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-gray-100 text-gray-500',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function hasMappableCoords(report) {
  return report.target_lat != null && report.target_lng != null;
}

export default function ReportSidebar({ reports = [], loading, error, onSelectReport }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-32 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Loading reports…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 text-red-600 text-sm">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
        <span>Failed to load reports. Check that the backend is running.</span>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
        <MapPin size={20} />
        No reports yet
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100" role="list" aria-label="Reports">
      {reports.map((report) => {
        const mappable = hasMappableCoords(report);
        const badgeClass =
          STATUS_BADGE[report.status] ?? 'bg-gray-100 text-gray-500';

        return (
          <li key={report.id}>
            <button
              className="w-full text-left px-4 py-3 hover:bg-regavim-blue/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => mappable && onSelectReport?.(report)}
              disabled={!mappable}
              aria-disabled={!mappable}
              title={!mappable ? 'No coordinates recorded for this report' : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {report.description || 'No description'}
                </p>
                <span
                  className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium capitalize ${badgeClass}`}
                >
                  {report.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(report.created_at)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

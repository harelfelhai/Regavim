import { MapPin, AlertCircle, Loader2 } from 'lucide-react';

export const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  pending:            'ממתין',
  confirmed:          'אושר בשטח',
  approved:           'מאושר',
  rejected:           'נדחה',
  deletion_requested: 'ממתין למחיקה',
};

const CATEGORY_LABELS = {
  ILLEGAL_CONSTRUCTION:      'בנייה לא חוקית',
  LAND_GRADING:              'עבודות עפר',
  AGRICULTURAL_ENCROACHMENT: 'השתלטות על קרקע חקלאית',
  ROAD_PAVING:               'סלילת דרך',
  DEMOLITION:                'הריסה',
  ILLEGAL_DUMPING:           'השלכת פסולת',
  OTHER:                     'אחר',
};

function formatCategory(cat) {
  if (!cat) return null;
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function ReportSidebar({ reports = [], loading, error, onSelectReport }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-32 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" />
        טוען דיווחים...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 text-red-600 text-sm">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
        <span>שגיאה בטעינת דיווחים. יש לוודא שהשרת פועל.</span>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
        <MapPin size={20} />
        אין דיווחים עדיין
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100" role="list" aria-label="דיווחים">
      {reports.map((report) => {
        const badgeClass = STATUS_BADGE[report.status] ?? 'bg-gray-100 text-gray-500';
        const category = formatCategory(report.final_category || report.ai_category);

        return (
          <li key={report.id}>
            <button
              className="w-full text-start px-4 py-3 hover:bg-regavim-blue/5 transition-colors"
              onClick={() => onSelectReport?.(report)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {report.description || 'ללא תיאור'}
                </p>
                <span
                  className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${badgeClass}`}
                >
                  {STATUS_LABELS[report.status] ?? report.status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                {category ? (
                  <span className="text-xs text-regavim-blue/80 font-medium truncate">
                    {category}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">ללא קטגוריה</span>
                )}
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDate(report.created_at)}
                </span>
              </div>
              {report.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {report.tags.map((t) => (
                    <span key={t} className="rounded-full bg-regavim-blue/10 text-regavim-blue/70 px-1.5 py-px text-[10px] font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

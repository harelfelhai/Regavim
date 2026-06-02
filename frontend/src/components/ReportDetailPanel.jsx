import { useState, useEffect } from 'react';
import {
  ArrowRight,
  AlertCircle,
  Loader2,
  MapPin,
  CheckCircle2,
  Trash2,
  Clock,
  XCircle,
  Skull,
} from 'lucide-react';
import { useReportDetail } from '../hooks/useReportDetail';
import { getImageFileUrl } from '../services/images';
import TagInput from './TagInput';

const CATEGORIES = [
  'ILLEGAL_CONSTRUCTION',
  'LAND_GRADING',
  'AGRICULTURAL_ENCROACHMENT',
  'ROAD_PAVING',
  'DEMOLITION',
  'ILLEGAL_DUMPING',
  'OTHER',
];

const CATEGORY_LABELS = {
  ILLEGAL_CONSTRUCTION:      'בנייה לא חוקית',
  LAND_GRADING:              'עבודות עפר',
  AGRICULTURAL_ENCROACHMENT: 'השתלטות על קרקע חקלאית',
  ROAD_PAVING:               'סלילת דרך',
  DEMOLITION:                'הריסה',
  ILLEGAL_DUMPING:           'השלכת פסולת',
  OTHER:                     'אחר',
};

const STATUS_LABELS = {
  pending:            'ממתין',
  confirmed:          'אושר בשטח',
  approved:           'מאושר',
  rejected:           'נדחה',
  deletion_requested: 'ממתין למחיקה',
};

const STATUS_BADGE = {
  pending:            'bg-amber-100 text-amber-700',
  confirmed:          'bg-blue-100 text-blue-700',
  approved:           'bg-green-100 text-green-700',
  rejected:           'bg-gray-100 text-gray-500',
  deletion_requested: 'bg-red-100 text-red-600',
};

// Statuses where the coordinator category form is still shown.
const EDITABLE_STATUSES = new Set(['pending', 'confirmed']);

// Statuses where requesting deletion is not allowed.
const NON_DELETABLE_STATUSES = new Set(['approved', 'rejected', 'deletion_requested']);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCategory(cat) {
  return cat ? (CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ')) : '—';
}

function formatStatus(s) {
  return STATUS_LABELS[s] ?? s.replace(/_/g, ' ');
}

export default function ReportDetailPanel({ reportId, onBack, onPatched, currentUser }) {
  const [confirmValue, setConfirmValue] = useState('');
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [rejectConfirmed, setRejectConfirmed] = useState(false);
  const [hardDeleteStep, setHardDeleteStep] = useState(0); // 0→1→2 two-step confirm
  const [localTags, setLocalTags] = useState(null); // null = follow report.tags

  useEffect(() => {
    setConfirmValue('');
    setDeletionConfirmed(false);
    setRejectConfirmed(false);
    setHardDeleteStep(0);
    setLocalTags(null);
  }, [reportId]);

  const {
    report, loading, error,
    patching, patchError,
    confirmCategory, requestDeletion, rejectReport, hardDeleteReport, saveTags,
  } = useReportDetail(reportId, { onPatched });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-32 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" />
        טוען...
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
  const displayCategory = confirmValue || report.final_category || '';
  const displayTags = localTags ?? (report.tags || []);

  // Admins act on reports directly (reject / hard-delete), so they don't see the
  // "request deletion" button — that's only for the non-admin owner, whose
  // request goes to a manager for review.
  const canRequestDeletion =
    currentUser &&
    currentUser.role !== 'admin' &&
    !NON_DELETABLE_STATUSES.has(report.status) &&
    currentUser.id === report.user_id;

  const canReject =
    currentUser?.role === 'admin' &&
    report.status !== 'rejected';

  async function handleConfirm(e) {
    e.preventDefault();
    if (!displayCategory) return;
    const ok = await confirmCategory(displayCategory);
    if (ok) setConfirmValue('');
  }

  async function handleRequestDeletion() {
    if (!deletionConfirmed) {
      setDeletionConfirmed(true);
      return;
    }
    await requestDeletion();
    setDeletionConfirmed(false);
  }

  async function handleReject() {
    if (!rejectConfirmed) {
      setRejectConfirmed(true);
      return;
    }
    await rejectReport();
    setRejectConfirmed(false);
  }

  async function handleHardDelete() {
    if (hardDeleteStep < 2) {
      setHardDeleteStep((s) => s + 1);
      return;
    }
    const ok = await hardDeleteReport();
    if (!ok) setHardDeleteStep(0);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-regavim-border sticky top-0 bg-white z-10">
        <button
          onClick={onBack}
          aria-label="חזרה לרשימה"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowRight size={15} />
          חזרה
        </button>
        <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${badgeClass}`}>
          {formatStatus(report.status)}
        </span>
      </div>

      {/* Evidence image */}
      {firstImageId && (
        <div className="w-full flex-shrink-0">
          <img
            src={getImageFileUrl(firstImageId)}
            alt="תמונת ראיה"
            className="w-full object-cover max-h-52"
            data-testid="report-image"
          />
        </div>
      )}

      {/* Metadata */}
      <div className="px-4 py-4 space-y-3 flex-1">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">תאריך הדיווח</p>
          <p className="text-sm text-gray-800">{formatDate(report.created_at)}</p>
        </div>

        {report.observed_at && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock size={12} className="text-regavim-blue flex-shrink-0" />
            <span>נצפה: <span className="text-gray-700">{formatDateTime(report.observed_at)}</span></span>
          </div>
        )}

        {report.description && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">תיאור</p>
            <p className="text-sm text-gray-700">{report.description}</p>
          </div>
        )}

        {report.final_category && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">קטגוריה מאושרת</p>
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

        {/* Tags — editable on pending/confirmed reports */}
        <div>
          <p className="text-xs text-gray-400 mb-1">תגיות</p>
          {canConfirm ? (
            <TagInput
              value={displayTags}
              onChange={(t) => { setLocalTags(t); saveTags(t); }}
              placeholder="הוסף תגית לפרשייה..."
            />
          ) : displayTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {displayTags.map((t) => (
                <span key={t} className="rounded-full bg-regavim-blue/10 text-regavim-blue px-2 py-0.5 text-xs font-medium">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-300">ללא תגיות</span>
          )}
        </div>
      </div>

      {/* Confirmation section — only for actionable statuses */}
      {canConfirm && (
        <div className="border-t border-regavim-border px-4 py-4 flex-shrink-0">
          <p className="text-xs font-medium text-gray-600 mb-2">קבע קטגוריה סופית</p>
          <form onSubmit={handleConfirm} className="space-y-2" data-testid="confirm-form">
            <select
              aria-label="קטגוריה סופית"
              value={displayCategory}
              onChange={(e) => setConfirmValue(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
            >
              <option value="">— בחר קטגוריה —</option>
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
                  שומר...
                </span>
              ) : (
                'אישור קטגוריה'
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
              מאושר:{' '}
              <span className="font-medium">{formatCategory(report.final_category)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Deletion request — owner or admin only */}
      {canRequestDeletion && (
        <div className="border-t border-regavim-border px-4 py-4 flex-shrink-0 space-y-2">
          {deletionConfirmed && (
            <p className="text-xs text-red-600" data-testid="deletion-confirm-prompt">
              האם אתה בטוח? הדיווח יסומן לבדיקת מנהל.
            </p>
          )}
          {patchError && !canConfirm && !canReject && (
            <p role="alert" className="text-xs text-red-600">{patchError}</p>
          )}
          <button
            type="button"
            onClick={handleRequestDeletion}
            disabled={patching}
            data-testid="request-deletion-btn"
            className={`w-full flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              deletionConfirmed
                ? 'border-red-400 bg-red-50 text-red-600 hover:bg-red-100'
                : 'border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500'
            }`}
          >
            <Trash2 size={14} />
            {deletionConfirmed ? 'אישור בקשת המחיקה' : 'בקשת מחיקה'}
          </button>
          {deletionConfirmed && (
            <button
              type="button"
              onClick={() => setDeletionConfirmed(false)}
              className="w-full text-xs text-gray-400 hover:text-gray-600"
            >
              ביטול
            </button>
          )}
        </div>
      )}

      {/* Reject — admin only */}
      {canReject && (
        <div className="border-t border-regavim-border px-4 py-4 flex-shrink-0 space-y-2">
          {rejectConfirmed && (
            <p className="text-xs text-orange-600" data-testid="reject-confirm-prompt">
              הדיווח יסומן כנדחה ויוסר מהמפה. האם להמשיך?
            </p>
          )}
          {patchError && canReject && !canConfirm && (
            <p role="alert" className="text-xs text-red-600">{patchError}</p>
          )}
          <button
            type="button"
            onClick={handleReject}
            disabled={patching}
            data-testid="reject-btn"
            className={`w-full flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              rejectConfirmed
                ? 'border-orange-400 bg-orange-50 text-orange-600 hover:bg-orange-100'
                : 'border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500'
            }`}
          >
            <XCircle size={14} />
            {rejectConfirmed ? 'אישור דחיית הדיווח' : 'דחה דיווח'}
          </button>
          {rejectConfirmed && (
            <button
              type="button"
              onClick={() => setRejectConfirmed(false)}
              className="w-full text-xs text-gray-400 hover:text-gray-600"
            >
              ביטול
            </button>
          )}
        </div>
      )}

      {/* Hard delete — admin only, two-step confirm */}
      {currentUser?.role === 'admin' && (
        <div className="border-t border-regavim-border px-4 py-4 flex-shrink-0 space-y-2">
          {hardDeleteStep === 1 && (
            <p className="text-xs text-red-600">
              פעולה זו בלתי הפיכה — הדיווח יימחק לצמיתות מהמערכת.
            </p>
          )}
          {hardDeleteStep === 2 && (
            <p className="text-xs font-semibold text-red-700" data-testid="hard-delete-confirm-prompt">
              האם אתה בטוח לחלוטין? לחץ שוב למחיקה סופית.
            </p>
          )}
          {patchError && hardDeleteStep > 0 && (
            <p role="alert" className="text-xs text-red-600">{patchError}</p>
          )}
          <button
            type="button"
            onClick={handleHardDelete}
            disabled={patching}
            data-testid="hard-delete-btn"
            className={`w-full flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              hardDeleteStep > 0
                ? 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-400'
            }`}
          >
            <Skull size={14} />
            {hardDeleteStep === 0 && 'מחק לצמיתות'}
            {hardDeleteStep === 1 && 'אישור ראשון — המשך?'}
            {hardDeleteStep === 2 && 'אישור סופי — מחק!'}
          </button>
          {hardDeleteStep > 0 && (
            <button
              type="button"
              onClick={() => setHardDeleteStep(0)}
              className="w-full text-xs text-gray-400 hover:text-gray-600"
            >
              ביטול
            </button>
          )}
        </div>
      )}
    </div>
  );
}

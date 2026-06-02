import { useRef, useState, useCallback, useEffect } from 'react';
import { Filter, X, Eye, EyeOff } from 'lucide-react';
import { fetchTags } from '../services/reports';

const STATUSES = ['pending', 'confirmed', 'approved', 'rejected', 'deletion_requested'];

const STATUS_LABELS = {
  pending:            'ממתין',
  confirmed:          'אושר בשטח',
  approved:           'מאושר',
  rejected:           'נדחה',
  deletion_requested: 'ממתין למחיקה',
};

export default function FilterBar({ filters, onChange, showRejected, onToggleRejected, isAdmin }) {
  const [tagInput, setTagInput] = useState(filters.tag || '');
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [showTagSug, setShowTagSug] = useState(false);
  const tagDebounce = useRef(null);

  // Keep local input in sync if the filter is cleared externally.
  useEffect(() => {
    if (!filters.tag) setTagInput('');
  }, [filters.tag]);

  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  const hasActive = filters.status || filters.dateFrom || filters.dateTo || filters.tag;

  function clearAll() {
    onChange({ status: '', dateFrom: '', dateTo: '', tag: '' });
    setTagInput('');
    setTagSuggestions([]);
  }

  const loadTagSuggestions = useCallback(async (q) => {
    if (!q.trim()) { setTagSuggestions([]); return; }
    try {
      const tags = await fetchTags(q);
      setTagSuggestions(tags);
    } catch {
      setTagSuggestions([]);
    }
  }, []);

  function handleTagInput(e) {
    const q = e.target.value;
    setTagInput(q);
    setShowTagSug(true);
    clearTimeout(tagDebounce.current);
    tagDebounce.current = setTimeout(() => loadTagSuggestions(q), 250);
    if (!q) set('tag', '');
  }

  function applyTag(tag) {
    setTagInput(tag);
    set('tag', tag);
    setShowTagSug(false);
    setTagSuggestions([]);
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); applyTag(tagInput.trim()); }
    else if (e.key === 'Escape') setShowTagSug(false);
  }

  return (
    <div className="px-4 py-3 border-b border-regavim-border bg-regavim-bg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Filter size={12} />
          סינון
        </div>
        {hasActive && (
          <button
            onClick={clearAll}
            className="text-xs text-regavim-blue hover:underline"
            data-testid="clear-filters"
          >
            נקה
          </button>
        )}
      </div>

      <div className="space-y-2">
        {isAdmin && (
          <button
            type="button"
            onClick={onToggleRejected}
            className={`w-full flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium transition-colors ${
              showRejected
                ? 'border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-100'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {showRejected ? <Eye size={12} /> : <EyeOff size={12} />}
            {showRejected ? 'הסתר דיווחים נדחים' : 'הצג דיווחים נדחים'}
          </button>
        )}
        <select
          aria-label="סינון לפי סטטוס"
          value={filters.status}
          onChange={(e) => set('status', e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
        >
          <option value="">כל הסטטוסים</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>

        {/* Tag filter with autocomplete */}
        <div className="relative">
          <div className="relative">
            <input
              type="text"
              aria-label="סינון לפי תגית"
              placeholder="סינון לפי תגית..."
              value={tagInput}
              onChange={handleTagInput}
              onKeyDown={handleTagKeyDown}
              onFocus={() => tagInput && setShowTagSug(true)}
              onBlur={() => setTimeout(() => setShowTagSug(false), 150)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40 pe-6"
            />
            {tagInput && (
              <button
                type="button"
                onClick={() => { setTagInput(''); set('tag', ''); setTagSuggestions([]); }}
                aria-label="נקה תגית"
                className="absolute inset-y-0 end-1.5 flex items-center text-gray-400 hover:text-gray-600"
              >
                <X size={11} />
              </button>
            )}
          </div>
          {showTagSug && tagSuggestions.length > 0 && (
            <ul className="absolute z-50 mt-0.5 w-full rounded-md border border-gray-200 bg-white shadow-lg overflow-auto max-h-32">
              {tagSuggestions.map((t) => (
                <li
                  key={t}
                  onMouseDown={() => applyTag(t)}
                  className="px-2.5 py-1 text-xs cursor-pointer hover:bg-gray-50 text-gray-700"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">מ-</label>
            <input
              type="date"
              aria-label="מתאריך"
              value={filters.dateFrom}
              onChange={(e) => set('dateFrom', e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">עד</label>
            <input
              type="date"
              aria-label="עד תאריך"
              value={filters.dateTo}
              onChange={(e) => set('dateTo', e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

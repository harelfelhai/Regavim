import { Filter } from 'lucide-react';

const STATUSES = ['pending', 'confirmed', 'approved', 'rejected', 'deletion_requested'];

export default function FilterBar({ filters, onChange }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  const hasActive = filters.status || filters.dateFrom || filters.dateTo;

  return (
    <div className="px-4 py-3 border-b border-regavim-border bg-regavim-bg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Filter size={12} />
          Filters
        </div>
        {hasActive && (
          <button
            onClick={() => onChange({ status: '', dateFrom: '', dateTo: '' })}
            className="text-xs text-regavim-blue hover:underline"
            data-testid="clear-filters"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => set('status', e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">From</label>
            <input
              type="date"
              aria-label="From date"
              value={filters.dateFrom}
              onChange={(e) => set('dateFrom', e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-0.5">To</label>
            <input
              type="date"
              aria-label="To date"
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

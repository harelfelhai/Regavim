import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, LogOut, Plus } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import useAuthStore from '../store/authStore';
import useMapStore from '../store/mapStore';
import Map from './Map';
import ReportSidebar from './ReportSidebar';
import ReportForm from './ReportForm';
import FilterBar from './FilterBar';
import ReportDetailPanel from './ReportDetailPanel';

const EMPTY_FILTERS = { status: '', dateFrom: '', dateTo: '' };

export default function MapDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const { panTarget, panTo, selectedReportId, selectReport, clearSelection } = useMapStore();

  const activeFilters = useMemo(() => {
    const f = {};
    if (filters.status) f.status = filters.status;
    if (filters.dateFrom) f.date_from = `${filters.dateFrom}T00:00:00`;
    if (filters.dateTo) f.date_to = `${filters.dateTo}T23:59:59`;
    return f;
  }, [filters]);

  const { reports, loading, error, refresh } = useReports(activeFilters);

  function handleSelectReport(report) {
    selectReport(report.id);
    if (report.target_lat != null && report.target_lng != null) {
      panTo(report.target_lat, report.target_lng);
    }
  }

  function handleSubmitted() {
    setShowForm(false);
    refresh();
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-regavim-bg">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 bg-regavim-surface flex flex-col border-r border-regavim-border shadow-sm">
        <header className="px-4 py-3 border-b border-regavim-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-regavim-blue" />
              <h1 className="text-base font-semibold text-regavim-navy">
                Regavim Monitor
              </h1>
            </div>
            <button
              onClick={() => setShowForm(true)}
              aria-label="New report"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-regavim-blue text-white text-xs font-medium hover:bg-regavim-blue/90 transition-colors"
            >
              <Plus size={13} />
              New
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-6">
            {loading
              ? 'Loading…'
              : `${reports.length} report${reports.length !== 1 ? 's' : ''}`}
          </p>
        </header>

        {/* Sidebar body: detail view or filter + list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {selectedReportId ? (
            <ReportDetailPanel
              key={selectedReportId}
              reportId={selectedReportId}
              onBack={clearSelection}
              onPatched={refresh}
              currentUser={user}
            />
          ) : (
            <>
              <FilterBar filters={filters} onChange={setFilters} />
              <ReportSidebar
                reports={reports}
                loading={loading}
                error={error}
                onSelectReport={handleSelectReport}
              />
            </>
          )}
        </div>

        {/* ── Footer: user info + logout ───────────────────────────────── */}
        <footer className="px-4 py-3 border-t border-regavim-border flex-shrink-0 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400 truncate" title={user?.email}>
            {user?.email ?? ''}
          </span>
          <button
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </footer>
      </aside>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 h-full relative">
        <Map
          reports={reports}
          panTarget={panTarget}
          selectedReportId={selectedReportId}
          onSelectReport={handleSelectReport}
        />

        {/* ── Report Form Modal ──────────────────────────────────────────── */}
        {showForm && (
          <div
            className="absolute inset-0 bg-black/40 flex items-center justify-center z-[1000]"
            onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
            data-testid="report-form-backdrop"
          >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
              <ReportForm
                onClose={() => setShowForm(false)}
                onSubmitted={handleSubmitted}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

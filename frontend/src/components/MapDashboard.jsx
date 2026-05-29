import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, LogOut, Plus, List, X } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import { useOfflineSync } from '../hooks/useOfflineSync';
import useAuthStore from '../store/authStore';
import useMapStore from '../store/mapStore';
import Map from './Map';
import OfflineQueue from './OfflineQueue';
import ReportSidebar from './ReportSidebar';
import ReportForm from './ReportForm';
import FilterBar from './FilterBar';
import ReportDetailPanel from './ReportDetailPanel';

const EMPTY_FILTERS = { status: '', dateFrom: '', dateTo: '', tag: '' };

export default function MapDashboard() {
  const navigate = useNavigate();
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [showForm,      setShowForm]      = useState(false);
  const [initialTarget, setInitialTarget] = useState(null);
  const [draftToEdit,   setDraftToEdit]   = useState(null);
  const [filters,       setFilters]       = useState(EMPTY_FILTERS);
  // Mobile: sidebar is hidden by default; visible on toggle.
  const [showSidebar,   setShowSidebar]   = useState(false);

  const { panTarget, panTo, selectedReportId, selectReport, clearSelection } = useMapStore();

  const activeFilters = useMemo(() => {
    const f = {};
    if (filters.status)   f.status    = filters.status;
    if (filters.dateFrom) f.date_from = `${filters.dateFrom}T00:00:00`;
    if (filters.dateTo)   f.date_to   = `${filters.dateTo}T23:59:59`;
    if (filters.tag)      f.tag       = filters.tag;
    return f;
  }, [filters]);

  const { reports, loading, error, refresh } = useReports(activeFilters);
  const { queue, syncing, isOnline, discard, retry, refresh: refreshQueue } = useOfflineSync();

  function handleSelectReport(report) {
    selectReport(report.id);
    if (report.target_lat != null && report.target_lng != null) {
      panTo(report.target_lat, report.target_lng);
    }
  }

  function handleSubmitted() {
    if (draftToEdit) discard(draftToEdit.id);
    setShowForm(false);
    setInitialTarget(null);
    setDraftToEdit(null);
    refresh();
  }

  function handleCloseForm() {
    setShowForm(false);
    setInitialTarget(null);
    setDraftToEdit(null);
  }

  function handleEditDraft(item) {
    setDraftToEdit(item);
    setInitialTarget(null);
    setShowForm(true);
    setShowSidebar(false);
  }

  function handleCreateAtMap(coords) {
    setInitialTarget(coords);
    setShowForm(true);
    setShowSidebar(false);
  }

  function handleNewReport() {
    setInitialTarget(null);
    setShowForm(true);
    setShowSidebar(false);
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen h-[100dvh] w-screen overflow-hidden bg-regavim-bg">

      {/* ── Mobile sidebar backdrop ──────────────────────────────────────── */}
      {showSidebar && (
        <div
          className="sm:hidden fixed inset-0 bg-black/30 z-[998]"
          onClick={() => setShowSidebar(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      {/*
        Desktop (sm+): static flex column on the right (RTL start).
        Mobile:        fixed overlay that slides in from the right edge.
        The translate-x-full / translate-x-0 trick moves the panel off-screen
        when hidden; sm:translate-x-0 always keeps it visible on desktop.
      */}
      <aside
        className={[
          'fixed sm:relative inset-y-0 end-0',
          'z-[999] sm:z-auto',
          'w-72 flex-shrink-0',
          'bg-regavim-surface flex flex-col',
          'border-s sm:border-e border-regavim-border',
          'shadow-xl sm:shadow-sm',
          'transition-transform duration-300 ease-in-out',
          showSidebar ? 'translate-x-0' : 'translate-x-full',
          'sm:translate-x-0',
        ].join(' ')}
      >
        <header className="px-4 py-3 border-b border-regavim-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-regavim-blue" />
              <h1 className="text-base font-semibold text-regavim-navy">
                Regavim Monitor
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewReport}
                aria-label="דיווח חדש"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-regavim-blue text-white text-xs font-medium hover:bg-regavim-blue/90 transition-colors"
              >
                <Plus size={13} />
                חדש
              </button>
              {/* Close button — visible only on mobile */}
              <button
                onClick={() => setShowSidebar(false)}
                aria-label="סגור רשימה"
                className="sm:hidden p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ms-6">
            {loading ? 'טוען...' : `${reports.length} דיווחים`}
          </p>
        </header>

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

        <OfflineQueue
          queue={queue}
          syncing={syncing}
          isOnline={isOnline}
          onRetry={retry}
          onDiscard={discard}
          onEdit={handleEditDraft}
        />

        <footer className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-regavim-border flex-shrink-0 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400 truncate" title={user?.email}>
            {user?.email ?? ''}
          </span>
          <button
            onClick={handleLogout}
            aria-label="יציאה"
            title="יציאה"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <LogOut size={13} />
            יציאה
          </button>
        </footer>
      </aside>

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 h-full relative">
        <Map
          reports={reports}
          panTarget={panTarget}
          selectedReportId={selectedReportId}
          onSelectReport={handleSelectReport}
          onCreateAt={handleCreateAtMap}
        />

        {/* Mobile FABs — hidden on desktop ─────────────────────────────── */}
        {!showForm && (
          <>
            {/* New-report FAB */}
            <button
              onClick={handleNewReport}
              aria-label="דיווח חדש"
              className="sm:hidden absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] start-4 z-[500] bg-regavim-blue text-white p-4 rounded-full shadow-xl active:scale-95 transition-transform"
            >
              <Plus size={22} />
            </button>

            {/* Sidebar toggle FAB */}
            <button
              onClick={() => setShowSidebar((v) => !v)}
              aria-label={showSidebar ? 'סגור רשימה' : 'הצג רשימה'}
              className="sm:hidden absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] start-4 z-[500] bg-white border border-gray-200 text-gray-700 p-3.5 rounded-full shadow-lg active:scale-95 transition-transform"
            >
              <List size={20} />
            </button>
          </>
        )}

        {/* Desktop hint for right-click/long-press shortcut */}
        {!showForm && (
          <div className="hidden sm:block absolute bottom-3 start-3 z-[500] bg-white/90 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-1.5 text-xs text-gray-600 pointer-events-none">
            לחיצה ארוכה / ימנית במפה — דיווח חדש במיקום
          </div>
        )}

        {/* ── Report Form Modal ─────────────────────────────────────────── */}
        {showForm && (
          <div
            className="absolute inset-0 bg-black/40 flex items-center justify-center z-[1000]"
            onClick={(e) => { if (e.target === e.currentTarget) handleCloseForm(); }}
            data-testid="report-form-backdrop"
          >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[95svh] overflow-y-auto">
              <ReportForm
                onClose={handleCloseForm}
                onSubmitted={handleSubmitted}
                initialTarget={initialTarget}
                initialDraft={draftToEdit}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

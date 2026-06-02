import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, LogOut, Plus, ChevronRight, EyeOff, Eye } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useMediaQuery } from '../hooks/useMediaQuery';
import useAuthStore from '../store/authStore';
import useMapStore from '../store/mapStore';
import Map from './Map';
import MobileBottomSheet from './MobileBottomSheet';
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
  const [showRejected,  setShowRejected]  = useState(false);
  // Mobile bottom-sheet snap: 'peek' | 'half' | 'full'.
  const [sheetSnap,     setSheetSnap]     = useState('peek');

  // Below Tailwind's `sm` breakpoint (640px) we use the bottom sheet; above it,
  // the static right-hand sidebar.
  const isMobile = useMediaQuery('(max-width: 639px)');

  const { panTarget, panTo, selectedReportId, selectReport, clearSelection } = useMapStore();

  const activeFilters = useMemo(() => {
    const f = {};
    if (filters.status)   f.status    = filters.status;
    if (filters.dateFrom) f.date_from = `${filters.dateFrom}T00:00:00`;
    if (filters.dateTo)   f.date_to   = `${filters.dateTo}T23:59:59`;
    if (filters.tag)      f.tag       = filters.tag;
    return f;
  }, [filters]);

  const { reports: allReports, loading, error, refresh } = useReports(activeFilters);
  const reports = useMemo(
    () => showRejected ? allReports : allReports.filter((r) => r.status !== 'rejected'),
    [allReports, showRejected],
  );
  const { queue, syncing, isOnline, discard, retry } = useOfflineSync();

  // On mobile, expand the sheet to half-height when a report is selected so its
  // details are visible, and collapse back to a peek when the selection clears.
  useEffect(() => {
    if (!isMobile) return;
    setSheetSnap(selectedReportId ? 'half' : 'peek');
  }, [selectedReportId, isMobile]);

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
  }

  function handleCreateAtMap(coords) {
    setInitialTarget(coords);
    setShowForm(true);
  }

  function handleNewReport() {
    setInitialTarget(null);
    setShowForm(true);
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  // ── Shared panel pieces (rendered in either the desktop aside or the mobile
  //    bottom sheet — never both at once, so detail panels mount only once) ───
  const detailOrList = selectedReportId ? (
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
  );

  const offlineQueueEl = (
    <OfflineQueue
      queue={queue}
      syncing={syncing}
      isOnline={isOnline}
      onRetry={retry}
      onDiscard={discard}
      onEdit={handleEditDraft}
    />
  );

  const footerEl = (
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
  );

  const newReportButton = (
    <button
      onClick={handleNewReport}
      aria-label="דיווח חדש"
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-regavim-blue text-white text-xs font-medium hover:bg-regavim-blue/90 transition-colors"
    >
      <Plus size={13} />
      חדש
    </button>
  );

  return (
    <div className="flex h-screen h-[100dvh] w-screen overflow-hidden bg-regavim-bg">

      {/* ── Desktop sidebar (sm and up) ──────────────────────────────────── */}
      {!isMobile && (
        <aside className="relative w-72 flex-shrink-0 bg-regavim-surface flex flex-col border-e border-regavim-border shadow-sm">
          <header className="px-4 py-3 border-b border-regavim-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-regavim-blue" />
                <h1 className="text-base font-semibold text-regavim-navy">
                  Regavim Monitor
                </h1>
              </div>
              <div className="flex items-center gap-1.5">
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setShowRejected((v) => !v)}
                    aria-label={showRejected ? 'הסתר נדחים' : 'הצג נדחים'}
                    title={showRejected ? 'הסתר דיווחים נדחים' : 'הצג דיווחים נדחים'}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      showRejected
                        ? 'bg-orange-50 border-orange-300 text-orange-600 hover:bg-orange-100'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                    }`}
                  >
                    {showRejected ? <Eye size={12} /> : <EyeOff size={12} />}
                    נדחים
                  </button>
                )}
                {newReportButton}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 ms-6">
              {loading ? 'טוען...' : `${reports.length} דיווחים`}
            </p>
          </header>

          <div className="flex-1 overflow-y-auto min-h-0">
            {detailOrList}
          </div>

          {offlineQueueEl}
          {footerEl}
        </aside>
      )}

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 h-full relative">
        <Map
          reports={reports}
          panTarget={panTarget}
          selectedReportId={selectedReportId}
          onSelectReport={handleSelectReport}
          onCreateAt={handleCreateAtMap}
        />

        {/* Desktop hint for right-click/long-press shortcut */}
        {!isMobile && !showForm && (
          <div className="absolute bottom-3 start-3 z-[500] bg-white/90 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-1.5 text-xs text-gray-600 pointer-events-none">
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

      {/* ── Mobile bottom sheet (below sm) ───────────────────────────────── */}
      {isMobile && !showForm && (
        <MobileBottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
          <div className="px-4 py-2 flex items-center justify-between border-b border-regavim-border flex-shrink-0">
            {selectedReportId ? (
              <button
                onClick={clearSelection}
                className="flex items-center gap-1 text-sm text-regavim-blue font-medium"
              >
                <ChevronRight size={16} />
                חזרה לרשימה
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-regavim-blue" />
                <span className="text-sm font-medium text-regavim-navy">
                  {loading ? 'טוען...' : `${reports.length} דיווחים`}
                </span>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setShowRejected((v) => !v)}
                    aria-label={showRejected ? 'הסתר נדחים' : 'הצג נדחים'}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
                      showRejected ? 'text-orange-500' : 'text-gray-400'
                    }`}
                  >
                    {showRejected ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
              </div>
            )}
            {newReportButton}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {detailOrList}
          </div>

          {offlineQueueEl}
          {footerEl}
        </MobileBottomSheet>
      )}
    </div>
  );
}

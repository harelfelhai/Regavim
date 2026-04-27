import { useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import useMapStore from '../store/mapStore';
import Map from './Map';
import ReportSidebar from './ReportSidebar';
import ReportForm from './ReportForm';

export default function MapDashboard() {
  const { reports, loading, error, refresh } = useReports();
  const { panTarget, panTo, selectReport } = useMapStore();
  const [showForm, setShowForm] = useState(false);

  function handleSelectReport(report) {
    selectReport(report.id);
    if (report.target_lat != null && report.target_lng != null) {
      panTo(report.target_lat, report.target_lng);
    }
  }

  function handleSubmitted() {
    setShowForm(false);
    refresh?.();
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-regavim-bg">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 bg-regavim-surface flex flex-col border-r border-regavim-border shadow-sm">
        <header className="px-4 py-3 border-b border-regavim-border">
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

        <div className="flex-1 overflow-y-auto">
          <ReportSidebar
            reports={reports}
            loading={loading}
            error={error}
            onSelectReport={handleSelectReport}
          />
        </div>
      </aside>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 h-full relative">
        <Map reports={reports} panTarget={panTarget} />

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

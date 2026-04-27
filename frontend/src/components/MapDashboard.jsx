import { Layers } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import useMapStore from '../store/mapStore';
import Map from './Map';
import ReportSidebar from './ReportSidebar';

export default function MapDashboard() {
  const { reports, loading, error } = useReports();
  const { panTarget, panTo, selectReport } = useMapStore();

  function handleSelectReport(report) {
    selectReport(report.id);
    if (report.target_lat != null && report.target_lng != null) {
      panTo(report.target_lat, report.target_lng);
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-regavim-bg">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 bg-regavim-surface flex flex-col border-r border-regavim-border shadow-sm">
        <header className="px-4 py-3 border-b border-regavim-border">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-regavim-blue" />
            <h1 className="text-base font-semibold text-regavim-navy">
              Regavim Monitor
            </h1>
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
      </main>
    </div>
  );
}

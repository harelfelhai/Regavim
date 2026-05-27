import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  LayersControl,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

const { BaseLayer } = LayersControl;

const ISRAEL_CENTER = [31.5, 35.0];
const DEFAULT_ZOOM = 8;

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const ESRI_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR =
  'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

const STATUS_COLOR = {
  pending:            '#f59e0b', // amber-400  — needs action
  confirmed:          '#2563eb', // regavim-blue — coordinator reviewed
  approved:           '#22c55e', // green-500  — manager approved
  rejected:           '#9ca3af', // gray-400   — dismissed
  deletion_requested: '#dc2626', // red-600    — pending deletion review
};

function createMarkerIcon(status, isSelected = false) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.pending;
  const size = isSelected ? 26 : 20;
  const ring = isSelected ? 4 : 3;
  return L.divIcon({
    className: 'regavim-marker',
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${ring}px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.4);
      transition:transform .15s ease;
      ${isSelected ? 'transform:scale(1.15);' : ''}
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/** Watches panTarget in the Zustand store and calls map.panTo() when it changes. */
function MapController({ panTarget }) {
  const map = useMap();
  useEffect(() => {
    if (panTarget) {
      map.panTo([panTarget.lat, panTarget.lng], { animate: true });
    }
  }, [panTarget, map]);
  return null;
}

/**
 * Determines whether a report has valid, plottable coordinates.
 * Reports without target coordinates appear in the sidebar but not on the map.
 */
function isMappable(report) {
  return (
    report.target_lat != null &&
    report.target_lng != null &&
    Math.abs(report.target_lat) <= 90 &&
    Math.abs(report.target_lng) <= 180
  );
}

export default function Map({
  reports = [],
  panTarget = null,
  selectedReportId = null,
  onSelectReport = null,
}) {
  const mappable = reports.filter(isMappable);

  return (
    <MapContainer
      center={ISRAEL_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      data-testid="map-container"
    >
      <LayersControl position="topright">
        <BaseLayer checked name="Street">
          <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        </BaseLayer>
        <BaseLayer name="Satellite">
          <TileLayer url={ESRI_URL} attribution={ESRI_ATTR} maxZoom={19} />
        </BaseLayer>
      </LayersControl>

      {mappable.map((report) => (
        <Marker
          key={report.id}
          position={[report.target_lat, report.target_lng]}
          icon={createMarkerIcon(report.status, report.id === selectedReportId)}
          data-testid="report-marker"
          eventHandlers={{
            click: () => onSelectReport?.(report),
          }}
        />
      ))}

      <MapController panTarget={panTarget} />
    </MapContainer>
  );
}

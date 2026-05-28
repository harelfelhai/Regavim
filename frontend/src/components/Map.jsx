import { useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  LayersControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

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
  pending:            '#f59e0b',
  confirmed:          '#2563eb',
  approved:           '#22c55e',
  rejected:           '#9ca3af',
  deletion_requested: '#dc2626',
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

function isMappable(report) {
  return (
    report.target_lat != null &&
    report.target_lng != null &&
    Math.abs(report.target_lat) <= 90 &&
    Math.abs(report.target_lng) <= 180
  );
}

/**
 * Renders all reports as clustered markers using leaflet.markercluster.
 * Handles 10 000+ reports without DOM overhead — markers in clusters are not
 * added to the DOM until the user zooms in.
 *
 * onSelectReport is held in a ref so changing its reference never triggers a
 * full marker rebuild.
 */
function ClusteredMarkers({ reports, selectedReportId, onSelectReport }) {
  const map = useMap();
  const groupRef  = useRef(null);
  // Plain object used as a cache (id → L.Marker) to avoid naming conflicts
  // with the exported `Map` component function in this module.
  const cacheRef  = useRef({});
  const selectRef = useRef(onSelectReport);

  useEffect(() => { selectRef.current = onSelectReport; });

  // Create the cluster layer once and tear it down on unmount.
  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
      cacheRef.current = {};
    };
  }, [map]);

  // Sync markers whenever the report list or selection changes.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const mappable = reports.filter(isMappable);
    const newIds   = new Set(mappable.map((r) => r.id));
    const cache    = cacheRef.current;

    // Remove markers for deleted/filtered-out reports.
    for (const id of Object.keys(cache)) {
      if (!newIds.has(id)) {
        group.removeLayer(cache[id]);
        delete cache[id];
      }
    }

    // Add new markers or update icons for existing ones.
    const toAdd = [];
    for (const report of mappable) {
      const isSelected = report.id === selectedReportId;
      if (report.id in cache) {
        cache[report.id].setIcon(createMarkerIcon(report.status, isSelected));
      } else {
        const marker = L.marker(
          [report.target_lat, report.target_lng],
          { icon: createMarkerIcon(report.status, isSelected) },
        );
        marker.on('click', () => selectRef.current?.(report));
        cache[report.id] = marker;
        toAdd.push(marker);
      }
    }
    if (toAdd.length) group.addLayers(toAdd);
  }, [reports, selectedReportId]);

  return null;
}

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
 * Fires onCreateAt on right-click (desktop) and on long-press (mobile).
 * Leaflet surfaces long-press as a contextmenu event on touch devices, so a
 * single handler covers both. A 500 ms touch timer acts as a belt-and-suspenders
 * fallback for browsers where Leaflet's contextmenu synthesis isn't triggered.
 */
function NewReportHandler({ onCreateAt }) {
  const timerRef = useRef(null);

  useMapEvents({
    contextmenu(e) {
      clearTimeout(timerRef.current);
      onCreateAt?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    touchstart(e) {
      if (e.originalEvent.touches.length !== 1) return;
      const { lat, lng } = e.latlng;
      timerRef.current = setTimeout(() => {
        onCreateAt?.({ lat, lng });
      }, 600);
    },
    touchend()  { clearTimeout(timerRef.current); },
    touchmove() { clearTimeout(timerRef.current); },
  });
  return null;
}

export default function Map({
  reports = [],
  panTarget = null,
  selectedReportId = null,
  onSelectReport = null,
  onCreateAt = null,
}) {
  return (
    <MapContainer
      center={ISRAEL_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      data-testid="map-container"
    >
      <LayersControl position="topright">
        <BaseLayer checked name="רחובות">
          <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        </BaseLayer>
        <BaseLayer name="לוויין">
          <TileLayer url={ESRI_URL} attribution={ESRI_ATTR} maxZoom={19} />
        </BaseLayer>
      </LayersControl>

      <ClusteredMarkers
        reports={reports}
        selectedReportId={selectedReportId}
        onSelectReport={onSelectReport}
      />

      <MapController panTarget={panTarget} />
      {onCreateAt && <NewReportHandler onCreateAt={onCreateAt} />}
    </MapContainer>
  );
}

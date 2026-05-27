import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Loader2, AlertCircle, Crosshair } from 'lucide-react';

const ISRAEL_CENTER = { lat: 31.5, lng: 35.0 };
const DEFAULT_ZOOM = 8;
const PIN_ZOOM = 15;

const PIN_ICON = L.divIcon({
  className: 'regavim-pin',
  html: `<span style="
    display:block;width:24px;height:24px;border-radius:50% 50% 50% 0;
    background:#dc2626;border:3px solid #fff;
    transform:rotate(-45deg);transform-origin:center;
    box-shadow:0 2px 6px rgba(0,0,0,.45);
  "></span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

function ClickHandler({ onClick }) {
  useMapEvents({
    click(e) { onClick({ lat: e.latlng.lat, lng: e.latlng.lng }); },
  });
  return null;
}

function MapCenterer({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

/**
 * Mini-map for picking the violation location.
 * - `gpsCoords` (if available) pre-fills the pin so a user standing at the site
 *   can simply click Continue.
 * - `initialPin` (from a map-click on the main map) takes precedence over GPS.
 * - The pin can be dragged or repositioned by clicking elsewhere on the map.
 * - "השתמש במיקום שלי" snaps the pin to the latest GPS reading.
 */
export default function LocationPicker({
  initialPin = null,
  gpsCoords = null,
  gpsStatus = 'idle',     // 'idle' | 'loading' | 'ready' | 'error'
  onRetryGps,
  onChange,
}) {
  const [pin, setPin] = useState(initialPin ?? gpsCoords ?? null);
  // Track whether the user has manually moved the pin — if so, we don't
  // overwrite their choice when GPS resolves later.
  const [userTouched, setUserTouched] = useState(initialPin != null);

  // Snap the pin to GPS the first time it resolves, unless the user already
  // moved it. This is the "phone GPS as a hint" behavior.
  useEffect(() => {
    if (gpsStatus === 'ready' && gpsCoords && !userTouched && pin === null) {
      setPin(gpsCoords);
    }
  }, [gpsStatus, gpsCoords, userTouched, pin]);

  // Propagate to parent whenever the pin changes.
  useEffect(() => {
    onChange?.(pin);
  }, [pin, onChange]);

  function placePin(coords) {
    setPin(coords);
    setUserTouched(true);
  }

  function snapToGps() {
    if (gpsCoords) {
      setPin(gpsCoords);
      setUserTouched(false);
    } else {
      // GPS not ready — trigger a fresh request.
      onRetryGps?.();
    }
  }

  const mapCenter = pin ?? gpsCoords ?? ISRAEL_CENTER;
  const zoom = pin || gpsCoords ? PIN_ZOOM : DEFAULT_ZOOM;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-regavim-blue">
        <MapPin size={14} />
        <p className="text-xs font-semibold uppercase tracking-wide">
          איפה האירוע? סמן/י על המפה
        </p>
      </div>

      <div
        className="h-56 rounded-lg overflow-hidden border border-gray-200"
        data-testid="location-picker-map"
      >
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={zoom}
          className="h-full w-full"
          attributionControl={false}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution=""
          />
          <ClickHandler onClick={placePin} />
          <MapCenterer center={pin ?? gpsCoords} zoom={pin || gpsCoords ? PIN_ZOOM : DEFAULT_ZOOM} />
          {pin && (
            <Marker
              position={[pin.lat, pin.lng]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{
                dragend(e) {
                  const ll = e.target.getLatLng();
                  placePin({ lat: ll.lat, lng: ll.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={snapToGps}
          disabled={gpsStatus === 'loading'}
          data-testid="snap-to-gps"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-regavim-blue hover:text-regavim-blue disabled:opacity-60 disabled:cursor-wait transition-colors"
        >
          {gpsStatus === 'loading' ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Crosshair size={12} />
          )}
          {gpsStatus === 'loading' ? 'מאתר GPS...' : 'השתמש במיקום שלי'}
        </button>

        {gpsStatus === 'error' && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertCircle size={12} />
            GPS לא זמין — סמן/י ידנית
          </span>
        )}

        {pin && (
          <span className="ms-auto text-gray-400 font-mono text-[10px]">
            {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
          </span>
        )}
      </div>

      {!pin && (
        <p className="text-xs text-gray-400">
          לחץ/י על המפה או גרור/י את הסיכה כדי לסמן את מיקום האירוע.
        </p>
      )}
    </div>
  );
}

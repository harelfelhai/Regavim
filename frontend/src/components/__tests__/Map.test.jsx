/**
 * Map component tests.
 *
 * Leaflet, leaflet.markercluster, and react-leaflet are mocked because they
 * require a real DOM with computed layout that jsdom cannot provide.
 *
 * Markers are created imperatively via L.marker (not as JSX <Marker>
 * components), so tests inspect the arguments passed to the mock and fire
 * click handlers directly on the returned mock objects.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Map from '../Map';

// Suppress leaflet.markercluster's UMD wrapper which looks for a global L.
vi.mock('leaflet.markercluster', () => ({}));

// Track marker instances created during each test.
const createdMarkers = [];

const mockClusterGroup = {
  addLayer:    vi.fn(),
  addLayers:   vi.fn((layers) => { createdMarkers.push(...layers); }),
  removeLayer: vi.fn(),
  clearLayers: vi.fn(() => { createdMarkers.length = 0; }),
};

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
    marker: vi.fn((_pos, _opts) => {
      const m = { _handlers: {}, setIcon: vi.fn() };
      m.on = vi.fn((event, fn) => { m._handlers[event] = fn; return m; });
      return m;
    }),
    markerClusterGroup: vi.fn(() => mockClusterGroup),
  },
}));

vi.mock('react-leaflet', () => {
  const MapContainer = ({ children, 'data-testid': testId }) => (
    <div data-testid={testId ?? 'map-container'}>{children}</div>
  );
  const TileLayer = () => null;
  const LayersControl = ({ children }) => <div>{children}</div>;
  LayersControl.BaseLayer = ({ children }) => <div>{children}</div>;
  const useMap       = () => ({ panTo: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn() });
  const useMapEvents = vi.fn(() => null);
  return { MapContainer, TileLayer, LayersControl, useMap, useMapEvents };
});

const VALID     = { id: '1', status: 'pending',   target_lat: 31.5,  target_lng: 35.0 };
const NULL_LAT  = { id: '2', status: 'pending',   target_lat: null,  target_lng: 35.0 };
const NULL_LNG  = { id: '3', status: 'pending',   target_lat: 31.5,  target_lng: null };
const BOTH_NULL = { id: '4', status: 'pending',   target_lat: null,  target_lng: null };

beforeEach(() => { createdMarkers.length = 0; vi.clearAllMocks(); });
afterEach (() => cleanup());

describe('Map — rendering', () => {
  it('renders the map container', () => {
    render(<Map />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders without crash when reports is empty', () => {
    expect(() => render(<Map reports={[]} />)).not.toThrow();
  });

  it('renders without crash when reports prop is omitted', () => {
    expect(() => render(<Map />)).not.toThrow();
  });
});

describe('Map — coordinate filtering (ClusteredMarkers)', () => {
  it('creates a marker for a report with valid coordinates', () => {
    render(<Map reports={[VALID]} />);
    expect(createdMarkers).toHaveLength(1);
  });

  it('skips a marker when target_lat is null', () => {
    render(<Map reports={[NULL_LAT]} />);
    expect(createdMarkers).toHaveLength(0);
  });

  it('skips a marker when target_lng is null', () => {
    render(<Map reports={[NULL_LNG]} />);
    expect(createdMarkers).toHaveLength(0);
  });

  it('skips a marker when both coords are null', () => {
    render(<Map reports={[BOTH_NULL]} />);
    expect(createdMarkers).toHaveLength(0);
  });

  it('creates only mappable markers from a mixed list', () => {
    render(<Map reports={[VALID, BOTH_NULL, NULL_LAT]} />);
    expect(createdMarkers).toHaveLength(1);
  });

  it('creates a marker for every report with valid coords', () => {
    const reports = [
      { id: 'a', status: 'pending',   target_lat: 31.5, target_lng: 35.0 },
      { id: 'b', status: 'confirmed', target_lat: 32.0, target_lng: 34.8 },
      { id: 'c', status: 'approved',  target_lat: 31.8, target_lng: 35.1 },
      { id: 'd', status: 'rejected',  target_lat: 31.3, target_lng: 34.9 },
    ];
    render(<Map reports={reports} />);
    expect(createdMarkers).toHaveLength(4);
  });
});

describe('Map — marker interaction', () => {
  it('calls onSelectReport with the report when its marker is clicked', () => {
    const onSelect = vi.fn();
    render(<Map reports={[VALID]} onSelectReport={onSelect} />);
    expect(createdMarkers).toHaveLength(1);
    createdMarkers[0]._handlers.click?.();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(VALID);
  });

  it('does not crash when no onSelectReport prop is supplied', () => {
    render(<Map reports={[VALID]} />);
    expect(() => createdMarkers[0]?._handlers.click?.()).not.toThrow();
  });
});

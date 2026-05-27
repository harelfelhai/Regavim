/**
 * Map component tests.
 *
 * react-leaflet and leaflet are mocked because Leaflet requires a real DOM with
 * computed layout that jsdom cannot provide. These tests verify the React-level
 * logic (coord filtering, marker rendering) without the Leaflet canvas layer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Map from '../Map';

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({ options: {} })),
  },
}));

vi.mock('react-leaflet', () => {
  const MapContainer = ({ children, 'data-testid': testId }) => (
    <div data-testid={testId ?? 'map-container'}>{children}</div>
  );
  const TileLayer = () => null;
  const Marker = ({ children, eventHandlers, 'data-testid': testId }) => (
    <div data-testid={testId ?? 'marker'} onClick={() => eventHandlers?.click?.()}>
      {children}
    </div>
  );
  const LayersControl = ({ children }) => <div>{children}</div>;
  LayersControl.BaseLayer = ({ children }) => <div>{children}</div>;
  const useMap = () => ({ panTo: vi.fn(), setView: vi.fn() });
  return { MapContainer, TileLayer, Marker, LayersControl, useMap };
});

const VALID_REPORT = {
  id: '1', status: 'pending', description: 'Test report',
  target_lat: 31.5, target_lng: 35.0,
};
const NULL_LAT = { id: '2', status: 'pending', target_lat: null, target_lng: 35.0 };
const NULL_LNG = { id: '3', status: 'pending', target_lat: 31.5, target_lng: null };
const BOTH_NULL = { id: '4', status: 'pending', target_lat: null, target_lng: null };

afterEach(() => cleanup());

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

describe('Map — coordinate filtering', () => {
  it('renders a marker for a report with valid coordinates', () => {
    render(<Map reports={[VALID_REPORT]} />);
    expect(screen.getAllByTestId('report-marker').length).toBe(1);
  });

  it('skips a marker when target_lat is null', () => {
    render(<Map reports={[NULL_LAT]} />);
    expect(screen.queryAllByTestId('report-marker')).toHaveLength(0);
  });

  it('skips a marker when target_lng is null', () => {
    render(<Map reports={[NULL_LNG]} />);
    expect(screen.queryAllByTestId('report-marker')).toHaveLength(0);
  });

  it('skips a marker when both coords are null', () => {
    render(<Map reports={[BOTH_NULL]} />);
    expect(screen.queryAllByTestId('report-marker')).toHaveLength(0);
  });

  it('renders only mappable reports from a mixed list', () => {
    render(<Map reports={[VALID_REPORT, BOTH_NULL, NULL_LAT]} />);
    expect(screen.getAllByTestId('report-marker')).toHaveLength(1);
  });

  it('renders a marker for every report with valid coords', () => {
    const reports = [
      { id: 'a', status: 'pending',    target_lat: 31.5, target_lng: 35.0 },
      { id: 'b', status: 'confirmed',  target_lat: 32.0, target_lng: 34.8 },
      { id: 'c', status: 'approved',   target_lat: 31.8, target_lng: 35.1 },
      { id: 'd', status: 'rejected',   target_lat: 31.3, target_lng: 34.9 },
    ];
    render(<Map reports={reports} />);
    expect(screen.getAllByTestId('report-marker')).toHaveLength(4);
  });
});

describe('Map — marker interaction', () => {
  it('calls onSelectReport with the report when its marker is clicked', () => {
    const onSelect = vi.fn();
    render(<Map reports={[VALID_REPORT]} onSelectReport={onSelect} />);
    screen.getByTestId('report-marker').click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(VALID_REPORT);
  });

  it('does not crash when no onSelectReport prop is supplied', () => {
    render(<Map reports={[VALID_REPORT]} />);
    expect(() => screen.getByTestId('report-marker').click()).not.toThrow();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ReportSidebar from '../ReportSidebar';

const PENDING = {
  id: '1', status: 'pending', description: 'Road paving',
  target_lat: 31.5, target_lng: 35.0, created_at: '2024-03-22T09:15:00Z',
};
const CONFIRMED = {
  id: '2', status: 'confirmed', description: 'Illegal construction',
  target_lat: 32.0, target_lng: 34.8, created_at: '2024-04-01T12:00:00Z',
};
const NO_COORDS = {
  id: '3', status: 'pending', description: 'No location recorded',
  target_lat: null, target_lng: null, created_at: '2024-04-05T08:00:00Z',
};
const NO_DESC = {
  id: '4', status: 'rejected', description: null,
  target_lat: 31.8, target_lng: 35.1, created_at: null,
};

afterEach(() => cleanup());

describe('ReportSidebar — loading state', () => {
  it('shows a loading message when loading=true', () => {
    render(<ReportSidebar loading={true} />);
    expect(screen.getByText(/loading reports/i)).toBeInTheDocument();
  });
});

describe('ReportSidebar — error state', () => {
  it('shows an error message when error is set', () => {
    render(<ReportSidebar error={new Error('API down')} />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
});

describe('ReportSidebar — empty state', () => {
  it('shows "No reports yet" when reports array is empty', () => {
    render(<ReportSidebar reports={[]} />);
    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
  });

  it('shows "No reports yet" when reports prop is omitted', () => {
    render(<ReportSidebar />);
    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
  });
});

describe('ReportSidebar — report list', () => {
  beforeEach(() => {
    render(<ReportSidebar reports={[PENDING, CONFIRMED, NO_COORDS, NO_DESC]} />);
  });

  it('renders all report items', () => {
    expect(screen.getByText('Road paving')).toBeInTheDocument();
    expect(screen.getByText('Illegal construction')).toBeInTheDocument();
    expect(screen.getByText('No location recorded')).toBeInTheDocument();
  });

  it('shows "No description" for reports with null description', () => {
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
  });

  it('shows status badge for each report', () => {
    const badges = screen.getAllByText(/pending|confirmed|rejected/i);
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  it('button is disabled for reports with null coordinates', () => {
    const buttons = screen.getAllByRole('button');
    const noCoordButton = buttons.find((b) => b.textContent.includes('No location recorded'));
    expect(noCoordButton).toBeDisabled();
  });

  it('button is enabled for reports with valid coordinates', () => {
    const buttons = screen.getAllByRole('button');
    const roadButton = buttons.find((b) => b.textContent.includes('Road paving'));
    expect(roadButton).not.toBeDisabled();
  });

  it('renders a role=list for accessibility', () => {
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});

describe('ReportSidebar — interaction', () => {
  it('calls onSelectReport with the report when a mappable item is clicked', () => {
    const onSelect = vi.fn();
    render(<ReportSidebar reports={[PENDING]} onSelectReport={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(PENDING);
  });

  it('does not call onSelectReport when a no-coords item is clicked', () => {
    const onSelect = vi.fn();
    render(<ReportSidebar reports={[NO_COORDS]} onSelectReport={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not throw when onSelectReport is not provided', () => {
    render(<ReportSidebar reports={[PENDING]} />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});

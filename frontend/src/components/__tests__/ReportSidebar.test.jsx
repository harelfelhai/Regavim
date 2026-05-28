import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ReportSidebar from '../ReportSidebar';

const PENDING = {
  id: '1', status: 'pending', description: 'סלילת דרך',
  target_lat: 31.5, target_lng: 35.0, created_at: '2024-03-22T09:15:00Z',
};
const CONFIRMED = {
  id: '2', status: 'confirmed', description: 'בנייה לא חוקית',
  target_lat: 32.0, target_lng: 34.8, created_at: '2024-04-01T12:00:00Z',
};
const NO_COORDS = {
  id: '3', status: 'pending', description: 'אין מיקום',
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
    expect(screen.getByText(/טוען דיווחים/)).toBeInTheDocument();
  });
});

describe('ReportSidebar — error state', () => {
  it('shows an error message when error is set', () => {
    render(<ReportSidebar error={new Error('API down')} />);
    expect(screen.getByText(/שגיאה בטעינת דיווחים/)).toBeInTheDocument();
  });
});

describe('ReportSidebar — empty state', () => {
  it('shows "אין דיווחים עדיין" when reports array is empty', () => {
    render(<ReportSidebar reports={[]} />);
    expect(screen.getByText(/אין דיווחים עדיין/)).toBeInTheDocument();
  });

  it('shows "אין דיווחים עדיין" when reports prop is omitted', () => {
    render(<ReportSidebar />);
    expect(screen.getByText(/אין דיווחים עדיין/)).toBeInTheDocument();
  });
});

describe('ReportSidebar — report list', () => {
  beforeEach(() => {
    render(<ReportSidebar reports={[PENDING, CONFIRMED, NO_COORDS, NO_DESC]} />);
  });

  it('renders all report items', () => {
    expect(screen.getByText('סלילת דרך')).toBeInTheDocument();
    expect(screen.getByText('בנייה לא חוקית')).toBeInTheDocument();
    expect(screen.getByText('אין מיקום')).toBeInTheDocument();
  });

  it('shows "ללא תיאור" for reports with null description', () => {
    expect(screen.getByText(/ללא תיאור/)).toBeInTheDocument();
  });

  it('shows status badge for each report', () => {
    const badges = screen.getAllByText(/ממתין|אושר בשטח|נדחה/);
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  it('all buttons are enabled (detail opens for every report)', () => {
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it('renders a role=list for accessibility', () => {
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});

describe('ReportSidebar — status badge colors', () => {
  it('pending badge uses amber styling', () => {
    render(<ReportSidebar reports={[PENDING]} />);
    const badge = screen.getByText('ממתין');
    expect(badge.className).toContain('amber');
  });

  it('confirmed badge uses blue styling', () => {
    render(<ReportSidebar reports={[CONFIRMED]} />);
    const badge = screen.getByText('אושר בשטח');
    expect(badge.className).toContain('blue');
  });

  it('rejected badge uses gray styling', () => {
    render(<ReportSidebar reports={[NO_DESC]} />);
    const badge = screen.getByText('נדחה');
    expect(badge.className).toContain('gray');
  });
});

describe('ReportSidebar — category reflection', () => {
  it('shows the confirmed category label in the list row', () => {
    render(<ReportSidebar reports={[{ ...CONFIRMED, final_category: 'DEMOLITION' }]} />);
    expect(screen.getByText('הריסה')).toBeInTheDocument();
  });

  it('shows "ללא קטגוריה" when no category is present', () => {
    render(<ReportSidebar reports={[PENDING]} />);
    expect(screen.getByText(/ללא קטגוריה/)).toBeInTheDocument();
  });
});

describe('ReportSidebar — interaction', () => {
  it('calls onSelectReport when any item is clicked', () => {
    const onSelect = vi.fn();
    render(<ReportSidebar reports={[PENDING]} onSelectReport={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(PENDING);
  });

  it('calls onSelectReport even for no-coords reports', () => {
    const onSelect = vi.fn();
    render(<ReportSidebar reports={[NO_COORDS]} onSelectReport={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(NO_COORDS);
  });

  it('does not throw when onSelectReport is not provided', () => {
    render(<ReportSidebar reports={[PENDING]} />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '../FilterBar';

const EMPTY = { status: '', dateFrom: '', dateTo: '', tag: '' };

function renderBar(filters = EMPTY, onChange = vi.fn()) {
  return { onChange, ...render(<FilterBar filters={filters} onChange={onChange} />) };
}

describe('FilterBar — rendering', () => {
  it('renders a status select', () => {
    renderBar();
    expect(screen.getByRole('combobox', { name: 'סינון לפי סטטוס' })).toBeInTheDocument();
  });

  it('status select has all four status options', () => {
    renderBar();
    ['ממתין', 'אושר בשטח', 'מאושר', 'נדחה'].forEach((label) => {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    });
  });

  it('renders from and to date inputs', () => {
    renderBar();
    expect(screen.getByLabelText('מתאריך')).toBeInTheDocument();
    expect(screen.getByLabelText('עד תאריך')).toBeInTheDocument();
  });

  it('renders a tag filter input', () => {
    renderBar();
    expect(screen.getByLabelText('סינון לפי תגית')).toBeInTheDocument();
  });
});

describe('FilterBar — Clear button', () => {
  it('does not show Clear when no filters are active', () => {
    renderBar(EMPTY);
    expect(screen.queryByTestId('clear-filters')).not.toBeInTheDocument();
  });

  it('shows Clear when status filter is set', () => {
    renderBar({ ...EMPTY, status: 'pending' });
    expect(screen.getByTestId('clear-filters')).toBeInTheDocument();
  });

  it('shows Clear when dateFrom is set', () => {
    renderBar({ ...EMPTY, dateFrom: '2025-01-01' });
    expect(screen.getByTestId('clear-filters')).toBeInTheDocument();
  });

  it('shows Clear when tag is set', () => {
    renderBar({ ...EMPTY, tag: 'פרשייה א' });
    expect(screen.getByTestId('clear-filters')).toBeInTheDocument();
  });

  it('calls onChange with all-empty filters when Clear is clicked', () => {
    const { onChange } = renderBar({ ...EMPTY, status: 'pending' });
    fireEvent.click(screen.getByTestId('clear-filters'));
    expect(onChange).toHaveBeenCalledWith(EMPTY);
  });
});

describe('FilterBar — onChange callbacks', () => {
  it('calls onChange with updated status when select changes', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByRole('combobox', { name: 'סינון לפי סטטוס' }), {
      target: { value: 'confirmed' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, status: 'confirmed' });
  });

  it('calls onChange with updated dateFrom when from date changes', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('מתאריך'), { target: { value: '2025-01-01' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, dateFrom: '2025-01-01' });
  });

  it('calls onChange with updated dateTo when to date changes', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('עד תאריך'), { target: { value: '2025-12-31' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, dateTo: '2025-12-31' });
  });
});

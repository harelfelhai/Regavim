import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '../FilterBar';

const EMPTY = { status: '', dateFrom: '', dateTo: '' };

function renderBar(filters = EMPTY, onChange = vi.fn()) {
  return { onChange, ...render(<FilterBar filters={filters} onChange={onChange} />) };
}

describe('FilterBar — rendering', () => {
  it('renders a status select', () => {
    renderBar();
    expect(screen.getByRole('combobox', { name: /filter by status/i })).toBeInTheDocument();
  });

  it('status select has all four status options', () => {
    renderBar();
    ['Pending', 'Confirmed', 'Approved', 'Rejected'].forEach((label) => {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    });
  });

  it('renders from and to date inputs', () => {
    renderBar();
    expect(screen.getByLabelText('From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toBeInTheDocument();
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

  it('calls onChange with empty filters when Clear is clicked', () => {
    const { onChange } = renderBar({ ...EMPTY, status: 'pending' });
    fireEvent.click(screen.getByTestId('clear-filters'));
    expect(onChange).toHaveBeenCalledWith(EMPTY);
  });
});

describe('FilterBar — onChange callbacks', () => {
  it('calls onChange with updated status when select changes', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByRole('combobox', { name: /filter by status/i }), {
      target: { value: 'confirmed' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, status: 'confirmed' });
  });

  it('calls onChange with updated dateFrom when from date changes', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2025-01-01' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, dateFrom: '2025-01-01' });
  });

  it('calls onChange with updated dateTo when to date changes', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2025-12-31' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, dateTo: '2025-12-31' });
  });
});

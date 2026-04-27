import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportDetailPanel from '../ReportDetailPanel';
import { useReportDetail } from '../../hooks/useReportDetail';
import { getImageFileUrl } from '../../services/images';

vi.mock('../../hooks/useReportDetail');
vi.mock('../../services/images', () => ({
  getImageFileUrl: vi.fn((id) => `http://localhost:8000/api/v1/images/${id}/file`),
}));

const defaultHook = {
  report: null,
  loading: false,
  error: null,
  patching: false,
  patchError: null,
  confirmCategory: vi.fn(),
};

const MOCK_REPORT = {
  id: 'r-1',
  status: 'pending',
  ai_category: 'ROAD_PAVING',
  final_category: null,
  description: 'Unauthorized road paving near the green area.',
  created_at: '2025-03-15T10:00:00Z',
  target_lat: 31.5,
  target_lng: 35.0,
  image_ids: ['img-1'],
};

function renderPanel(hookOverrides = {}, props = {}) {
  useReportDetail.mockReturnValue({ ...defaultHook, ...hookOverrides });
  return render(
    <ReportDetailPanel
      reportId="r-1"
      onBack={vi.fn()}
      onPatched={vi.fn()}
      {...props}
    />,
  );
}

describe('ReportDetailPanel — loading state', () => {
  it('shows loading spinner while fetching', () => {
    renderPanel({ loading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('ReportDetailPanel — error state', () => {
  it('shows error message on fetch failure', () => {
    renderPanel({ error: 'Failed to load report' });
    expect(screen.getByText('Failed to load report')).toBeInTheDocument();
  });
});

describe('ReportDetailPanel — report data', () => {
  it('shows status badge', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows description', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.getByText('Unauthorized road paving near the green area.')).toBeInTheDocument();
  });

  it('shows AI suggested category in the metadata section', () => {
    renderPanel({ report: MOCK_REPORT });
    // The category appears inside a <span class="font-medium"> inside the AI badge
    const spans = screen.getAllByText('ROAD PAVING');
    const metaSpan = spans.find((el) => el.tagName === 'SPAN');
    expect(metaSpan).toBeInTheDocument();
  });

  it('shows coordinates', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.getByText(/31\.5/)).toBeInTheDocument();
  });

  it('shows the evidence image when image_ids is non-empty', () => {
    renderPanel({ report: MOCK_REPORT });
    const img = screen.getByTestId('report-image');
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('img-1');
  });

  it('does not render image when image_ids is empty', () => {
    renderPanel({ report: { ...MOCK_REPORT, image_ids: [] } });
    expect(screen.queryByTestId('report-image')).not.toBeInTheDocument();
  });
});

describe('ReportDetailPanel — confirmation form', () => {
  it('shows confirmation form for pending status', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.getByTestId('confirm-form')).toBeInTheDocument();
  });

  it('shows confirmation form for confirmed status', () => {
    renderPanel({ report: { ...MOCK_REPORT, status: 'confirmed' } });
    expect(screen.getByTestId('confirm-form')).toBeInTheDocument();
  });

  it('does not show confirmation form for approved status', () => {
    renderPanel({ report: { ...MOCK_REPORT, status: 'approved' } });
    expect(screen.queryByTestId('confirm-form')).not.toBeInTheDocument();
  });

  it('does not show confirmation form for rejected status', () => {
    renderPanel({ report: { ...MOCK_REPORT, status: 'rejected' } });
    expect(screen.queryByTestId('confirm-form')).not.toBeInTheDocument();
  });

  it('calls confirmCategory when form is submitted', () => {
    const confirmCategory = vi.fn().mockResolvedValue(true);
    renderPanel({ report: MOCK_REPORT, confirmCategory });
    // Select a category first so submit is enabled
    fireEvent.change(screen.getByRole('combobox', { name: /final category/i }), {
      target: { value: 'DEMOLITION' },
    });
    fireEvent.submit(screen.getByTestId('confirm-form'));
    expect(confirmCategory).toHaveBeenCalledWith('DEMOLITION');
  });

  it('shows patchError below the form', () => {
    renderPanel({ report: MOCK_REPORT, patchError: 'Update failed. Please try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Update failed. Please try again.');
  });

  it('shows approved read-only view for approved status', () => {
    renderPanel({
      report: { ...MOCK_REPORT, status: 'approved', final_category: 'ROAD_PAVING' },
    });
    expect(screen.getByText(/Approved/)).toBeInTheDocument();
  });
});

describe('ReportDetailPanel — navigation', () => {
  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    renderPanel({ report: MOCK_REPORT }, { onBack });
    fireEvent.click(screen.getByRole('button', { name: /back to list/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

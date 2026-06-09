import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportDetailPanel from '../ReportDetailPanel';
import { useReportDetail } from '../../hooks/useReportDetail';
import { getImageFileUrl } from '../../services/images';

vi.mock('../../hooks/useReportDetail');
vi.mock('../../services/images', () => ({
  getImageFileUrl: vi.fn((id) => `http://localhost:8000/api/v1/images/${id}/file`),
}));
vi.mock('../../services/reports', () => ({
  fetchComplaintAuthorities: vi.fn(() => Promise.resolve([
    { key: 'POLICE', label: 'משטרת ישראל', available: true },
    { key: 'ILA', label: 'רשות מקרקעי ישראל', available: false },
  ])),
}));

const MANAGER_USER = { id: 'user-manager', role: 'manager' };
const CONFIRMED_REPORT = { ...{
  id: 'r-1', status: 'confirmed', final_category: 'ROAD_PAVING',
  description: 'desc', created_at: '2025-03-15T10:00:00Z', observed_at: null,
  target_lat: 31.5, target_lng: 35.0, image_ids: ['img-1'], user_id: 'user-owner',
} };

const defaultHook = {
  report: null,
  loading: false,
  error: null,
  patching: false,
  patchError: null,
  confirmCategory: vi.fn(),
  requestDeletion: vi.fn(),
};

const MOCK_REPORT = {
  id: 'r-1',
  status: 'pending',
  final_category: null,
  description: 'סלילת דרך לא חוקית ליד השטח הירוק.',
  created_at: '2025-03-15T10:00:00Z',
  observed_at: null,
  target_lat: 31.5,
  target_lng: 35.0,
  image_ids: ['img-1'],
  user_id: 'user-owner',
};

const OWNER_USER  = { id: 'user-owner',  role: 'coordinator' };
const OTHER_USER  = { id: 'user-other',  role: 'coordinator' };
const ADMIN_USER  = { id: 'user-admin',  role: 'admin' };

function renderPanel(hookOverrides = {}, props = {}) {
  useReportDetail.mockReturnValue({ ...defaultHook, ...hookOverrides });
  return render(
    <ReportDetailPanel
      reportId="r-1"
      onBack={vi.fn()}
      onPatched={vi.fn()}
      currentUser={OWNER_USER}
      {...props}
    />,
  );
}

describe('ReportDetailPanel — loading state', () => {
  it('shows loading spinner while fetching', () => {
    renderPanel({ loading: true });
    expect(screen.getByText('טוען...')).toBeInTheDocument();
  });
});

describe('ReportDetailPanel — error state', () => {
  it('shows error message on fetch failure', () => {
    renderPanel({ error: 'שגיאה בטעינת הדיווח' });
    expect(screen.getByText('שגיאה בטעינת הדיווח')).toBeInTheDocument();
  });
});

describe('ReportDetailPanel — report data', () => {
  it('shows status badge', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.getByText('ממתין')).toBeInTheDocument();
  });

  it('shows deletion_requested status badge', () => {
    renderPanel({ report: { ...MOCK_REPORT, status: 'deletion_requested' } });
    expect(screen.getByText('ממתין למחיקה')).toBeInTheDocument();
  });

  it('shows description', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.getByText('סלילת דרך לא חוקית ליד השטח הירוק.')).toBeInTheDocument();
  });

  it('shows "קטגוריה מאושרת" label when final_category is set', () => {
    renderPanel({ report: { ...MOCK_REPORT, final_category: 'ROAD_PAVING', status: 'confirmed' } });
    expect(screen.getByText('קטגוריה מאושרת')).toBeInTheDocument();
  });

  it('shows coordinates', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.getByText(/31\.5/)).toBeInTheDocument();
  });

  it('shows observed_at when present', () => {
    const report = { ...MOCK_REPORT, observed_at: '2025-03-14T08:30:00Z' };
    renderPanel({ report });
    expect(screen.getByText(/נצפה:/)).toBeInTheDocument();
  });

  it('does not show observed_at row when null', () => {
    renderPanel({ report: MOCK_REPORT });
    expect(screen.queryByText(/נצפה:/)).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByRole('combobox', { name: 'קטגוריה סופית' }), {
      target: { value: 'DEMOLITION' },
    });
    fireEvent.submit(screen.getByTestId('confirm-form'));
    expect(confirmCategory).toHaveBeenCalledWith('DEMOLITION');
  });

  it('shows patchError below the form', () => {
    renderPanel({ report: MOCK_REPORT, patchError: 'העדכון נכשל. נסה/י שנית.' });
    expect(screen.getByRole('alert')).toHaveTextContent('העדכון נכשל. נסה/י שנית.');
  });

  it('shows approved read-only view for approved status', () => {
    renderPanel({
      report: { ...MOCK_REPORT, status: 'approved', final_category: 'ROAD_PAVING' },
    });
    expect(screen.getByText(/מאושר:/)).toBeInTheDocument();
  });
});

describe('ReportDetailPanel — deletion request button', () => {
  it('shows Request deletion button to report owner', () => {
    renderPanel({ report: MOCK_REPORT }, { currentUser: OWNER_USER });
    expect(screen.getByTestId('request-deletion-btn')).toBeInTheDocument();
  });

  it('hides Request deletion button from admin (admin uses reject instead)', () => {
    renderPanel({ report: MOCK_REPORT }, { currentUser: ADMIN_USER });
    // Admins act directly via reject / hard-delete, so they don't get the
    // manager-routed "request deletion" button.
    expect(screen.queryByTestId('request-deletion-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('reject-btn')).toBeInTheDocument();
    expect(screen.getByTestId('hard-delete-btn')).toBeInTheDocument();
  });

  it('hides Request deletion button from non-owner coordinator', () => {
    renderPanel({ report: MOCK_REPORT }, { currentUser: OTHER_USER });
    expect(screen.queryByTestId('request-deletion-btn')).not.toBeInTheDocument();
  });

  it('hides Request deletion button when currentUser is null', () => {
    renderPanel({ report: MOCK_REPORT }, { currentUser: null });
    expect(screen.queryByTestId('request-deletion-btn')).not.toBeInTheDocument();
  });

  it('hides Request deletion button when report is already deletion_requested', () => {
    renderPanel(
      { report: { ...MOCK_REPORT, status: 'deletion_requested' } },
      { currentUser: OWNER_USER },
    );
    expect(screen.queryByTestId('request-deletion-btn')).not.toBeInTheDocument();
  });

  it('hides Request deletion button for approved reports', () => {
    renderPanel(
      { report: { ...MOCK_REPORT, status: 'approved', final_category: 'ROAD_PAVING' } },
      { currentUser: OWNER_USER },
    );
    expect(screen.queryByTestId('request-deletion-btn')).not.toBeInTheDocument();
  });

  it('shows confirmation prompt on first click', () => {
    renderPanel({ report: MOCK_REPORT }, { currentUser: OWNER_USER });
    fireEvent.click(screen.getByTestId('request-deletion-btn'));
    expect(screen.getByTestId('deletion-confirm-prompt')).toBeInTheDocument();
  });

  it('calls requestDeletion on second (confirmed) click', () => {
    const requestDeletion = vi.fn().mockResolvedValue(true);
    renderPanel({ report: MOCK_REPORT, requestDeletion }, { currentUser: OWNER_USER });
    fireEvent.click(screen.getByTestId('request-deletion-btn')); // first: arm
    fireEvent.click(screen.getByTestId('request-deletion-btn')); // second: confirm
    expect(requestDeletion).toHaveBeenCalled();
  });

  it('cancels the pending confirm when Cancel is clicked', () => {
    renderPanel({ report: MOCK_REPORT }, { currentUser: OWNER_USER });
    fireEvent.click(screen.getByTestId('request-deletion-btn'));
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(screen.queryByTestId('deletion-confirm-prompt')).not.toBeInTheDocument();
  });
});

describe('ReportDetailPanel — navigation', () => {
  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    renderPanel({ report: MOCK_REPORT }, { onBack });
    fireEvent.click(screen.getByRole('button', { name: 'חזרה לרשימה' }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('ReportDetailPanel — complaint submission', () => {
  it('shows the complaint section for an admin on a confirmed report', async () => {
    renderPanel({ report: CONFIRMED_REPORT, complaints: [] }, { currentUser: ADMIN_USER });
    expect(await screen.findByTestId('complaint-section')).toBeInTheDocument();
  });

  it('shows the complaint section for a manager too', async () => {
    renderPanel({ report: CONFIRMED_REPORT, complaints: [] }, { currentUser: MANAGER_USER });
    expect(await screen.findByTestId('complaint-section')).toBeInTheDocument();
  });

  it('hides the complaint section from a coordinator', () => {
    renderPanel({ report: CONFIRMED_REPORT, complaints: [] }, { currentUser: OWNER_USER });
    expect(screen.queryByTestId('complaint-section')).not.toBeInTheDocument();
  });

  it('hides the complaint section on a pending (not-yet-validated) report', () => {
    renderPanel(
      { report: { ...CONFIRMED_REPORT, status: 'pending' }, complaints: [] },
      { currentUser: ADMIN_USER },
    );
    expect(screen.queryByTestId('complaint-section')).not.toBeInTheDocument();
  });

  it('disables an authority that has no configured email', async () => {
    renderPanel({ report: CONFIRMED_REPORT, complaints: [] }, { currentUser: ADMIN_USER });
    expect(await screen.findByTestId('complaint-authority-ILA')).toBeDisabled();
  });

  it('keeps submit disabled until an authority is selected', async () => {
    renderPanel({ report: CONFIRMED_REPORT, complaints: [] }, { currentUser: ADMIN_USER });
    await screen.findByTestId('complaint-authority-POLICE');
    expect(screen.getByTestId('submit-complaint-btn')).toBeDisabled();
    fireEvent.click(screen.getByTestId('complaint-authority-POLICE'));
    expect(screen.getByTestId('submit-complaint-btn')).not.toBeDisabled();
  });

  it('requires a two-step confirm before calling submitComplaint', async () => {
    const submitComplaint = vi.fn().mockResolvedValue([
      { authority_key: 'POLICE', authority_label: 'משטרת ישראל', status: 'sent' },
    ]);
    renderPanel({ report: CONFIRMED_REPORT, complaints: [], submitComplaint }, { currentUser: ADMIN_USER });
    fireEvent.click(await screen.findByTestId('complaint-authority-POLICE'));
    fireEvent.click(screen.getByTestId('submit-complaint-btn')); // arm
    expect(screen.getByTestId('complaint-confirm-prompt')).toBeInTheDocument();
    expect(submitComplaint).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('submit-complaint-btn')); // confirm
    expect(submitComplaint).toHaveBeenCalledWith(['POLICE']);
  });

  it('renders submission history', async () => {
    const complaints = [{
      id: 'c1', authority_key: 'POLICE', authority_label: 'משטרת ישראל',
      recipient_email: 'p@x', status: 'sent', error_message: null,
      created_at: '2025-03-16T09:00:00Z',
    }];
    renderPanel({ report: CONFIRMED_REPORT, complaints }, { currentUser: ADMIN_USER });
    expect(await screen.findByTestId('complaint-history')).toBeInTheDocument();
  });
});

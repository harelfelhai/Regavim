import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportForm from '../ReportForm';
import { useReportForm, STEP } from '../../hooks/useReportForm';

vi.mock('../../hooks/useReportForm');

// Mock navigator.geolocation for all tests (GPS is a browser API not in jsdom)
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(global.navigator, 'geolocation', {
    value: { getCurrentPosition: vi.fn() },
    configurable: true,
    writable: true,
  });
});

const defaultHook = {
  step: STEP.IDLE,
  imagePreview: null,
  aiCategory: null,
  analysisAvailable: false,
  error: null,
  handleFileChange: vi.fn(),
  handleSubmit: vi.fn(),
  cancelAndCleanup: vi.fn(),
};

function renderForm(hookOverrides = {}, props = {}) {
  useReportForm.mockReturnValue({ ...defaultHook, ...hookOverrides });
  return render(
    <ReportForm onClose={vi.fn()} onSubmitted={vi.fn()} {...props} />,
  );
}

const mockFile = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

// ── Mode selector ─────────────────────────────────────────────────────────────

describe('ReportForm — mode selector (idle state)', () => {
  it('renders Take Photo and Choose Photo buttons', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'צלם תמונה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'בחר מהגלריה' })).toBeInTheDocument();
  });

  it('renders the form header', () => {
    renderForm();
    expect(screen.getByText('דיווח חדש')).toBeInTheDocument();
  });

  it('does not show the upload dropzone', () => {
    renderForm();
    expect(screen.queryByText(/drop image here/i)).not.toBeInTheDocument();
  });
});

// ── Hidden file inputs ────────────────────────────────────────────────────────

describe('ReportForm — camera input', () => {
  it('calls handleFileChange with observedAt when camera file is selected (GPS ready)', async () => {
    // Simulate GPS resolving immediately with valid coordinates so the camera
    // path proceeds directly (no Q&A panel).
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((ok) =>
          ok({ coords: { latitude: 31.7, longitude: 35.2 } })
        ),
      },
      configurable: true,
      writable: true,
    });
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    // Trigger camera click so startGps() runs synchronously (callback fires immediately).
    fireEvent.click(screen.getByRole('button', { name: 'צלם תמונה' }));
    const input = screen.getByTestId('camera-input');
    fireEvent.change(input, { target: { files: [mockFile] } });
    // Wait a tick for the async handler.
    await Promise.resolve();
    expect(handleFileChange).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({ observedAt: expect.any(String) }),
    );
  });

  it('does not call handleFileChange when no file is selected on camera input', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    const input = screen.getByTestId('camera-input');
    fireEvent.change(input, { target: { files: [] } });
    expect(handleFileChange).not.toHaveBeenCalled();
  });
});

// ── Gallery metadata Q&A ──────────────────────────────────────────────────────

describe('ReportForm — gallery metadata Q&A', () => {
  function selectGalleryFile() {
    const input = screen.getByTestId('gallery-input');
    fireEvent.change(input, { target: { files: [mockFile] } });
  }

  it('shows Q&A panel after gallery file is selected', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByText(/היכן צולמה התמונה/)).toBeInTheDocument();
    expect(screen.getByText(/מתי צולמה התמונה/)).toBeInTheDocument();
  });

  it('shows the selected file name', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('Continue button is disabled until both questions answered', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByRole('button', { name: 'המשך' })).toBeDisabled();
  });

  it('Continue button enables after both questions answered', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/אני נמצא/));
    fireEvent.click(screen.getByLabelText(/היום \(כרגע\)/));
    expect(screen.getByRole('button', { name: 'המשך' })).not.toBeDisabled();
  });

  it('shows manual coordinate inputs when "מיקום אחר" is selected', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/מיקום אחר/));
    expect(screen.getByLabelText('קו רוחב יעד')).toBeInTheDocument();
    expect(screen.getByLabelText('קו אורך יעד')).toBeInTheDocument();
  });

  it('Continue stays disabled when manual selected but coords empty', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/מיקום אחר/));
    fireEvent.click(screen.getByLabelText(/היום \(כרגע\)/));
    expect(screen.getByRole('button', { name: 'המשך' })).toBeDisabled();
  });

  it('Continue enables when manual coords are filled', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/מיקום אחר/));
    fireEvent.click(screen.getByLabelText(/היום \(כרגע\)/));
    fireEvent.change(screen.getByLabelText('קו רוחב יעד'), { target: { value: '31.5' } });
    fireEvent.change(screen.getByLabelText('קו אורך יעד'), { target: { value: '35.0' } });
    expect(screen.getByRole('button', { name: 'המשך' })).not.toBeDisabled();
  });

  it('shows datetime picker when "תאריך ושעה אחרים" is selected', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/תאריך ושעה אחרים/));
    expect(screen.getByLabelText('תאריך ושעה של צפייה')).toBeInTheDocument();
  });

  it('calls handleFileChange with today timestamp when time=today', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/אני נמצא/));
    fireEvent.click(screen.getByLabelText(/היום \(כרגע\)/));
    fireEvent.submit(screen.getByRole('button', { name: 'המשך' }).closest('form'));
    expect(handleFileChange).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({ observedAt: expect.any(String) }),
    );
  });

  it('calls handleFileChange with null observedAt when custom date not filled', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/אני נמצא/));
    fireEvent.click(screen.getByLabelText(/תאריך ושעה אחרים/));
    fireEvent.submit(screen.getByRole('button', { name: 'המשך' }).closest('form'));
    expect(handleFileChange).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({ observedAt: null }),
    );
  });

  it('Back button returns to mode selector', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }));
    expect(screen.getByRole('button', { name: 'צלם תמונה' })).toBeInTheDocument();
  });
});

// ── Busy overlay ──────────────────────────────────────────────────────────────

describe('ReportForm — busy overlay', () => {
  it('shows uploading label during UPLOADING step', () => {
    renderForm({ step: STEP.UPLOADING, imagePreview: 'blob:x' });
    expect(screen.getByText('מעלה תמונה...')).toBeInTheDocument();
  });

  it('shows analyzing label during ANALYZING step', () => {
    renderForm({ step: STEP.ANALYZING, imagePreview: 'blob:x' });
    expect(screen.getByText('מנתח עם AI...')).toBeInTheDocument();
  });

  it('shows submitting label during SUBMITTING step', () => {
    renderForm({ step: STEP.SUBMITTING, imagePreview: 'blob:x' });
    expect(screen.getByText('שולח דיווח...')).toBeInTheDocument();
  });

  it('renders the image preview element', () => {
    renderForm({ step: STEP.ANALYZING, imagePreview: 'blob:x' });
    expect(screen.getByAltText('תצוגה מקדימה של התמונה הנבחרת')).toBeInTheDocument();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('ReportForm — error state', () => {
  it('shows the error message', () => {
    renderForm({ step: STEP.ERROR, error: 'ההעלאה נכשלה. נסה/י שנית.' });
    expect(screen.getByRole('alert')).toHaveTextContent('ההעלאה נכשלה. נסה/י שנית.');
  });

  it('calls cancelAndCleanup when Try again is clicked', () => {
    const cancelAndCleanup = vi.fn();
    renderForm({ step: STEP.ERROR, error: 'err', cancelAndCleanup });
    fireEvent.click(screen.getByText('נסה/י שוב'));
    expect(cancelAndCleanup).toHaveBeenCalled();
  });
});

// ── Close button ──────────────────────────────────────────────────────────────

describe('ReportForm — close button', () => {
  it('calls cancelAndCleanup and onClose when X is clicked', () => {
    const cancelAndCleanup = vi.fn();
    const onClose = vi.fn();
    renderForm({ cancelAndCleanup }, { onClose });
    fireEvent.click(screen.getByLabelText('סגירת הטופס'));
    expect(cancelAndCleanup).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// ── Ready state ───────────────────────────────────────────────────────────────

describe('ReportForm — ready state', () => {
  const readyHook = {
    step: STEP.READY,
    imagePreview: 'blob:x',
    aiCategory: 'ROAD_PAVING',
    analysisAvailable: true,
    error: null,
    handleFileChange: vi.fn(),
    handleSubmit: vi.fn(),
    cancelAndCleanup: vi.fn(),
  };

  it('shows AI suggestion label', () => {
    renderForm(readyHook);
    expect(screen.getByText('הצעת AI')).toBeInTheDocument();
  });

  it('pre-fills category select with aiCategory', () => {
    renderForm(readyHook);
    expect(screen.getByRole('combobox')).toHaveValue('ROAD_PAVING');
  });

  it('shows the description textarea', () => {
    renderForm(readyHook);
    expect(screen.getByPlaceholderText('תאר/י את שנצפה...')).toBeInTheDocument();
  });

  it('shows Submit Report button', () => {
    renderForm(readyHook);
    expect(screen.getByRole('button', { name: 'שלח דיווח' })).toBeInTheDocument();
  });

  it('Submit button is enabled when a category is selected', () => {
    renderForm(readyHook);
    expect(screen.getByRole('button', { name: 'שלח דיווח' })).not.toBeDisabled();
  });

  it('Submit button is disabled when no category is selected', () => {
    renderForm({ ...readyHook, aiCategory: null });
    expect(screen.getByRole('button', { name: 'שלח דיווח' })).toBeDisabled();
  });

  it('calls handleSubmit on form submit', () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ ...readyHook, handleSubmit });
    fireEvent.submit(screen.getByRole('button', { name: 'שלח דיווח' }).closest('form'));
    expect(handleSubmit).toHaveBeenCalled();
  });

  it('shows "AI לא זמין" label when analysisAvailable is false', () => {
    renderForm({ ...readyHook, analysisAvailable: false, aiCategory: null });
    expect(screen.getByText('AI לא זמין — אנא סווג/י')).toBeInTheDocument();
  });
});

// ── File validation ───────────────────────────────────────────────────────────

describe('ReportForm — file validation', () => {
  it('shows a file-error banner for an unsupported MIME type on the camera input', () => {
    renderForm();
    const gifFile = new File(['x'], 'anim.gif', { type: 'image/gif' });
    const input = screen.getByTestId('camera-input');
    fireEvent.change(input, { target: { files: [gifFile] } });
    expect(screen.getByTestId('file-error')).toBeInTheDocument();
    expect(screen.getByTestId('file-error')).toHaveTextContent(/פורמט לא נתמך/);
  });

  it('does not show a file-error banner for a valid JPEG under 10 MB on the camera input', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    const input = screen.getByTestId('camera-input');
    fireEvent.change(input, { target: { files: [mockFile] } });
    expect(screen.queryByTestId('file-error')).not.toBeInTheDocument();
  });

  it('shows a file-error banner for an unsupported MIME type on the gallery input', () => {
    renderForm();
    const gifFile = new File(['x'], 'anim.gif', { type: 'image/gif' });
    const input = screen.getByTestId('gallery-input');
    fireEvent.change(input, { target: { files: [gifFile] } });
    expect(screen.getByTestId('file-error')).toHaveTextContent(/פורמט לא נתמך/);
  });

  it('does not show Q&A panel after an invalid gallery file', () => {
    renderForm();
    const gifFile = new File(['x'], 'anim.gif', { type: 'image/gif' });
    const input = screen.getByTestId('gallery-input');
    fireEvent.change(input, { target: { files: [gifFile] } });
    expect(screen.queryByText(/היכן צולמה התמונה/)).not.toBeInTheDocument();
  });
});

// ── Done state ────────────────────────────────────────────────────────────────

describe('ReportForm — done state', () => {
  it('shows the success message', () => {
    renderForm({ step: STEP.DONE });
    expect(screen.getByText('הדיווח נשלח!')).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn();
    renderForm({ step: STEP.DONE }, { onClose });
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }));
    expect(onClose).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportForm from '../ReportForm';
import { useReportForm, STEP } from '../../hooks/useReportForm';

vi.mock('../../hooks/useReportForm');

// Stub LocationPicker so tests don't pull in Leaflet (which needs a real DOM).
// Exposes a button that fires onChange with a fixed pin coord.
vi.mock('../LocationPicker', () => ({
  default: ({ onChange, initialPin }) => (
    <div data-testid="location-picker-stub">
      <button
        type="button"
        data-testid="stub-set-pin"
        onClick={() => onChange({ lat: 31.5, lng: 35.0 })}
      >
        Set Pin
      </button>
      <button
        type="button"
        data-testid="stub-clear-pin"
        onClick={() => onChange(null)}
      >
        Clear Pin
      </button>
      <span data-testid="stub-initial-pin">
        {initialPin ? `${initialPin.lat},${initialPin.lng}` : 'none'}
      </span>
    </div>
  ),
}));

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
});

// ── Camera flow ───────────────────────────────────────────────────────────────

describe('ReportForm — camera flow', () => {
  it('shows the location picker after camera file selected (does not auto-proceed)', () => {
    renderForm();
    const input = screen.getByTestId('camera-input');
    fireEvent.change(input, { target: { files: [mockFile] } });
    expect(screen.getByTestId('location-picker-stub')).toBeInTheDocument();
  });

  it('does not show the time question in camera mode', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'צלם תמונה' }));
    fireEvent.change(screen.getByTestId('camera-input'), { target: { files: [mockFile] } });
    expect(screen.queryByText(/מתי צולמה התמונה/)).not.toBeInTheDocument();
  });

  it('camera flow: setting the pin enables Continue', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'צלם תמונה' }));
    fireEvent.change(screen.getByTestId('camera-input'), { target: { files: [mockFile] } });
    expect(screen.getByRole('button', { name: 'המשך' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('stub-set-pin'));
    expect(screen.getByRole('button', { name: 'המשך' })).not.toBeDisabled();
  });

  it('camera flow: Continue invokes handleFileChange with target coords and observedAt', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    fireEvent.click(screen.getByRole('button', { name: 'צלם תמונה' }));
    fireEvent.change(screen.getByTestId('camera-input'), { target: { files: [mockFile] } });
    fireEvent.click(screen.getByTestId('stub-set-pin'));
    fireEvent.submit(screen.getByTestId('metadata-form'));
    expect(handleFileChange).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({
        targetLat: 31.5,
        targetLng: 35.0,
        observedAt: expect.any(String),
      }),
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

// ── Gallery flow ──────────────────────────────────────────────────────────────

describe('ReportForm — gallery flow', () => {
  function selectGalleryFile() {
    const input = screen.getByTestId('gallery-input');
    fireEvent.change(input, { target: { files: [mockFile] } });
  }

  it('shows the Q&A form after gallery file is selected', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByTestId('metadata-form')).toBeInTheDocument();
    expect(screen.getByTestId('location-picker-stub')).toBeInTheDocument();
    expect(screen.getByText(/מתי צולמה התמונה/)).toBeInTheDocument();
  });

  it('shows the selected file name', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('Continue is disabled until both pin and time are set', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByRole('button', { name: 'המשך' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('stub-set-pin'));
    expect(screen.getByRole('button', { name: 'המשך' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/היום \(כרגע\)/));
    expect(screen.getByRole('button', { name: 'המשך' })).not.toBeDisabled();
  });

  it('Continue stays disabled when custom date is empty', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByTestId('stub-set-pin'));
    fireEvent.click(screen.getByLabelText(/תאריך ושעה אחרים/));
    expect(screen.getByRole('button', { name: 'המשך' })).toBeDisabled();
  });

  it('Continue enables once custom date is filled', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByTestId('stub-set-pin'));
    fireEvent.click(screen.getByLabelText(/תאריך ושעה אחרים/));
    fireEvent.change(screen.getByLabelText('תאריך ושעה של צפייה'), {
      target: { value: '2024-12-01T10:30' },
    });
    expect(screen.getByRole('button', { name: 'המשך' })).not.toBeDisabled();
  });

  it('shows datetime picker when "תאריך ושעה אחרים" is selected', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/תאריך ושעה אחרים/));
    expect(screen.getByLabelText('תאריך ושעה של צפייה')).toBeInTheDocument();
  });

  it('Continue with time=today produces a "now" observedAt', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    selectGalleryFile();
    fireEvent.click(screen.getByTestId('stub-set-pin'));
    fireEvent.click(screen.getByLabelText(/היום \(כרגע\)/));
    fireEvent.submit(screen.getByTestId('metadata-form'));
    expect(handleFileChange).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({
        targetLat: 31.5,
        targetLng: 35.0,
        observedAt: expect.any(String),
      }),
    );
  });

  it('Back button returns to mode selector', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }));
    expect(screen.getByRole('button', { name: 'צלם תמונה' })).toBeInTheDocument();
  });
});

// ── initialTarget prop ────────────────────────────────────────────────────────

describe('ReportForm — initialTarget pre-fill (map-click flow)', () => {
  it('passes initialTarget to the LocationPicker', () => {
    renderForm({}, { initialTarget: { lat: 32.1, lng: 34.8 } });
    fireEvent.change(screen.getByTestId('gallery-input'), { target: { files: [mockFile] } });
    expect(screen.getByTestId('stub-initial-pin')).toHaveTextContent('32.1,34.8');
  });

  it('Continue with initialTarget is immediately enabled in camera mode once time defaults', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange }, { initialTarget: { lat: 32.1, lng: 34.8 } });
    // Camera mode auto-sets timeChoice='today', and targetCoords starts at initialTarget
    fireEvent.click(screen.getByRole('button', { name: 'צלם תמונה' }));
    fireEvent.change(screen.getByTestId('camera-input'), { target: { files: [mockFile] } });
    expect(screen.getByRole('button', { name: 'המשך' })).not.toBeDisabled();
  });
});

// ── Busy overlay ──────────────────────────────────────────────────────────────

describe('ReportForm — busy overlay', () => {
  it('shows sending label during SUBMITTING step', () => {
    renderForm({ step: STEP.SUBMITTING, imagePreview: 'blob:x' });
    expect(screen.getByText('מעלה ושולח...')).toBeInTheDocument();
  });

  it('renders the image preview element during SUBMITTING', () => {
    renderForm({ step: STEP.SUBMITTING, imagePreview: 'blob:x' });
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
    error: null,
    handleFileChange: vi.fn(),
    handleSubmit: vi.fn(),
    cancelAndCleanup: vi.fn(),
  };

  it('shows the category select', () => {
    renderForm(readyHook);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ROAD_PAVING' } });
    expect(screen.getByRole('button', { name: 'שלח דיווח' })).not.toBeDisabled();
  });

  it('Submit button is disabled when no category is selected', () => {
    renderForm(readyHook);
    expect(screen.getByRole('button', { name: 'שלח דיווח' })).toBeDisabled();
  });

  it('calls handleSubmit on form submit', () => {
    const handleSubmit = vi.fn().mockResolvedValue(true);
    renderForm({ ...readyHook, handleSubmit });
    // Select a category first (makes description required), then add description.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ROAD_PAVING' } });
    fireEvent.change(screen.getByPlaceholderText('תאר/י את שנצפה...'), { target: { value: 'test description' } });
    fireEvent.submit(screen.getByRole('button', { name: 'שלח דיווח' }).closest('form'));
    expect(handleSubmit).toHaveBeenCalled();
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

  it('does not show a file-error banner for a valid JPEG on the camera input', () => {
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
    expect(screen.queryByTestId('metadata-form')).not.toBeInTheDocument();
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

// ── Queued (offline) state ────────────────────────────────────────────────────

describe('ReportForm — queued state (offline save)', () => {
  it('shows the offline-saved heading', () => {
    renderForm({ step: STEP.QUEUED });
    expect(screen.getByText('הדיווח נשמר')).toBeInTheDocument();
  });

  it('shows the offline explanation text', () => {
    renderForm({ step: STEP.QUEUED });
    expect(screen.getByText(/הדיווח יישלח אוטומטית/)).toBeInTheDocument();
  });

  it('renders the queued-screen test ID', () => {
    renderForm({ step: STEP.QUEUED });
    expect(screen.getByTestId('queued-screen')).toBeInTheDocument();
  });

  it('calls onClose when the Close button is clicked', () => {
    const onClose = vi.fn();
    renderForm({ step: STEP.QUEUED }, { onClose });
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }));
    expect(onClose).toHaveBeenCalled();
  });
});

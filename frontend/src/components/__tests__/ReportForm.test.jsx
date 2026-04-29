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
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose from gallery/i })).toBeInTheDocument();
  });

  it('renders the form header', () => {
    renderForm();
    expect(screen.getByText('New Report')).toBeInTheDocument();
  });

  it('does not show the upload dropzone', () => {
    renderForm();
    expect(screen.queryByText(/drop image here/i)).not.toBeInTheDocument();
  });
});

// ── Hidden file inputs ────────────────────────────────────────────────────────

describe('ReportForm — camera input', () => {
  it('calls handleFileChange with observedAt when camera file is selected', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    const input = screen.getByTestId('camera-input');
    fireEvent.change(input, { target: { files: [mockFile] } });
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
    expect(screen.getByText(/where was this photo taken/i)).toBeInTheDocument();
    expect(screen.getByText(/when was this photo taken/i)).toBeInTheDocument();
  });

  it('shows the selected file name', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('Continue button is disabled until both questions answered', () => {
    renderForm();
    selectGalleryFile();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('Continue button enables after both questions answered', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/i'm at the location right now/i));
    fireEvent.click(screen.getByLabelText(/today/i));
    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
  });

  it('shows manual coordinate inputs when "somewhere else" is selected', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/somewhere else/i));
    expect(screen.getByLabelText(/target latitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target longitude/i)).toBeInTheDocument();
  });

  it('Continue stays disabled when manual selected but coords empty', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/somewhere else/i));
    fireEvent.click(screen.getByLabelText(/today/i));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('Continue enables when manual coords are filled', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/somewhere else/i));
    fireEvent.click(screen.getByLabelText(/today/i));
    fireEvent.change(screen.getByLabelText(/target latitude/i), { target: { value: '31.5' } });
    fireEvent.change(screen.getByLabelText(/target longitude/i), { target: { value: '35.0' } });
    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
  });

  it('shows datetime picker when "another date" is selected', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/another date/i));
    expect(screen.getByLabelText(/observation date and time/i)).toBeInTheDocument();
  });

  it('calls handleFileChange with today timestamp when time=today', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/i'm at the location right now/i));
    fireEvent.click(screen.getByLabelText(/today/i));
    fireEvent.submit(screen.getByRole('button', { name: /continue/i }).closest('form'));
    expect(handleFileChange).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({ observedAt: expect.any(String) }),
    );
  });

  it('calls handleFileChange with null observedAt when custom date not filled', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    selectGalleryFile();
    fireEvent.click(screen.getByLabelText(/i'm at the location right now/i));
    fireEvent.click(screen.getByLabelText(/another date/i));
    // don't fill datetime-local
    fireEvent.submit(screen.getByRole('button', { name: /continue/i }).closest('form'));
    expect(handleFileChange).toHaveBeenCalledWith(
      mockFile,
      expect.objectContaining({ observedAt: null }),
    );
  });

  it('Back button returns to mode selector', () => {
    renderForm();
    selectGalleryFile();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument();
  });
});

// ── Busy overlay ──────────────────────────────────────────────────────────────

describe('ReportForm — busy overlay', () => {
  it('shows uploading label during UPLOADING step', () => {
    renderForm({ step: STEP.UPLOADING, imagePreview: 'blob:x' });
    expect(screen.getByText('Uploading image…')).toBeInTheDocument();
  });

  it('shows analyzing label during ANALYZING step', () => {
    renderForm({ step: STEP.ANALYZING, imagePreview: 'blob:x' });
    expect(screen.getByText('Analysing with AI…')).toBeInTheDocument();
  });

  it('shows submitting label during SUBMITTING step', () => {
    renderForm({ step: STEP.SUBMITTING, imagePreview: 'blob:x' });
    expect(screen.getByText('Submitting report…')).toBeInTheDocument();
  });

  it('renders the image preview element', () => {
    renderForm({ step: STEP.ANALYZING, imagePreview: 'blob:x' });
    expect(screen.getByAltText('Preview of selected image')).toBeInTheDocument();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('ReportForm — error state', () => {
  it('shows the error message', () => {
    renderForm({ step: STEP.ERROR, error: 'Upload failed. Please try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed. Please try again.');
  });

  it('calls cancelAndCleanup when Try again is clicked', () => {
    const cancelAndCleanup = vi.fn();
    renderForm({ step: STEP.ERROR, error: 'err', cancelAndCleanup });
    fireEvent.click(screen.getByText('Try again'));
    expect(cancelAndCleanup).toHaveBeenCalled();
  });
});

// ── Close button ──────────────────────────────────────────────────────────────

describe('ReportForm — close button', () => {
  it('calls cancelAndCleanup and onClose when X is clicked', () => {
    const cancelAndCleanup = vi.fn();
    const onClose = vi.fn();
    renderForm({ cancelAndCleanup }, { onClose });
    fireEvent.click(screen.getByLabelText('Close form'));
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
    expect(screen.getByText('AI Suggestion')).toBeInTheDocument();
  });

  it('pre-fills category select with aiCategory', () => {
    renderForm(readyHook);
    expect(screen.getByRole('combobox')).toHaveValue('ROAD_PAVING');
  });

  it('shows the description textarea', () => {
    renderForm(readyHook);
    expect(screen.getByPlaceholderText('Describe what you observed…')).toBeInTheDocument();
  });

  it('shows Submit Report button', () => {
    renderForm(readyHook);
    expect(screen.getByRole('button', { name: 'Submit Report' })).toBeInTheDocument();
  });

  it('Submit button is enabled when a category is selected', () => {
    renderForm(readyHook);
    expect(screen.getByRole('button', { name: 'Submit Report' })).not.toBeDisabled();
  });

  it('Submit button is disabled when no category is selected', () => {
    renderForm({ ...readyHook, aiCategory: null });
    expect(screen.getByRole('button', { name: 'Submit Report' })).toBeDisabled();
  });

  it('calls handleSubmit on form submit', () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ ...readyHook, handleSubmit });
    fireEvent.submit(screen.getByRole('button', { name: 'Submit Report' }).closest('form'));
    expect(handleSubmit).toHaveBeenCalled();
  });

  it('shows "AI unavailable" label when analysisAvailable is false', () => {
    renderForm({ ...readyHook, analysisAvailable: false, aiCategory: null });
    expect(screen.getByText('AI unavailable — please classify')).toBeInTheDocument();
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
    expect(screen.getByTestId('file-error')).toHaveTextContent(/unsupported format/i);
  });

  it('shows a file-error banner for a file over 10 MB on the camera input', () => {
    renderForm();
    const bigFile = new File(['x'.repeat(100)], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 });
    const input = screen.getByTestId('camera-input');
    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(screen.getByTestId('file-error')).toHaveTextContent(/too large/i);
    expect(screen.getByTestId('file-error')).toHaveTextContent(/10 MB/i);
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
    expect(screen.getByTestId('file-error')).toHaveTextContent(/unsupported format/i);
  });

  it('does not show Q&A panel after an invalid gallery file', () => {
    renderForm();
    const gifFile = new File(['x'], 'anim.gif', { type: 'image/gif' });
    const input = screen.getByTestId('gallery-input');
    fireEvent.change(input, { target: { files: [gifFile] } });
    expect(screen.queryByText(/where was this photo taken/i)).not.toBeInTheDocument();
  });
});

// ── Done state ────────────────────────────────────────────────────────────────

describe('ReportForm — done state', () => {
  it('shows the success message', () => {
    renderForm({ step: STEP.DONE });
    expect(screen.getByText('Report submitted!')).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn();
    renderForm({ step: STEP.DONE }, { onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

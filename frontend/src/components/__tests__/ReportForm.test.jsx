import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportForm from '../ReportForm';
import { useReportForm, STEP } from '../../hooks/useReportForm';

vi.mock('../../hooks/useReportForm');

const defaultHook = {
  step: STEP.IDLE,
  imagePreview: null,
  aiCategory: null,
  analysisAvailable: false,
  error: null,
  handleFileChange: vi.fn(),
  handleSubmit: vi.fn(),
  reset: vi.fn(),
};

function renderForm(hookOverrides = {}, props = {}) {
  useReportForm.mockReturnValue({ ...defaultHook, ...hookOverrides });
  return render(
    <ReportForm onClose={vi.fn()} onSubmitted={vi.fn()} {...props} />,
  );
}

describe('ReportForm — idle state', () => {
  it('renders the upload dropzone when no preview', () => {
    renderForm();
    expect(screen.getByLabelText('Click to upload image')).toBeInTheDocument();
  });

  it('renders the form header', () => {
    renderForm();
    expect(screen.getByText('New Report')).toBeInTheDocument();
  });
});

describe('ReportForm — file input', () => {
  it('calls handleFileChange when a file is selected', () => {
    const handleFileChange = vi.fn();
    renderForm({ handleFileChange });
    const input = screen.getByTestId('file-input');
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(handleFileChange).toHaveBeenCalledWith(file);
  });
});

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

describe('ReportForm — error state', () => {
  it('shows the error message', () => {
    renderForm({ step: STEP.ERROR, error: 'Upload failed. Please try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed. Please try again.');
  });

  it('calls reset when Try again is clicked', () => {
    const reset = vi.fn();
    renderForm({ step: STEP.ERROR, error: 'err', reset });
    fireEvent.click(screen.getByText('Try again'));
    expect(reset).toHaveBeenCalled();
  });
});

describe('ReportForm — ready state', () => {
  const readyHook = {
    step: STEP.READY,
    imagePreview: 'blob:x',
    aiCategory: 'ROAD_PAVING',
    analysisAvailable: true,
    error: null,
    handleFileChange: vi.fn(),
    handleSubmit: vi.fn(),
    reset: vi.fn(),
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

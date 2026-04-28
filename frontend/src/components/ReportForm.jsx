import { useRef, useState } from 'react';
import {
  Upload,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useReportForm, STEP } from '../hooks/useReportForm';

const CATEGORIES = [
  'ILLEGAL_CONSTRUCTION',
  'LAND_GRADING',
  'AGRICULTURAL_ENCROACHMENT',
  'ROAD_PAVING',
  'DEMOLITION',
  'ILLEGAL_DUMPING',
  'OTHER',
];

function formatCategory(cat) {
  return cat.replace(/_/g, ' ');
}

const STEP_LABEL = {
  [STEP.UPLOADING]:  'Uploading image…',
  [STEP.ANALYZING]:  'Analysing with AI…',
  [STEP.SUBMITTING]: 'Submitting report…',
};

export default function ReportForm({ onClose, onSubmitted }) {
  const fileInputRef = useRef(null);
  const [description, setDescription] = useState('');
  const [finalCategory, setFinalCategory] = useState('');

  const {
    step,
    imagePreview,
    aiCategory,
    analysisAvailable,
    error,
    handleFileChange,
    handleSubmit,
    cancelAndCleanup,
  } = useReportForm();

  // Pre-fill the category dropdown once AI responds.
  const displayedCategory = finalCategory || aiCategory || '';

  function onFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) handleFileChange(file);
  }

  async function onSubmit(e) {
    e.preventDefault();
    await handleSubmit({ description, finalCategory: displayedCategory || null });
    if (step !== STEP.ERROR) onSubmitted?.();
  }

  function handleReset() {
    cancelAndCleanup();
    setDescription('');
    setFinalCategory('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const isBusy =
    step === STEP.UPLOADING ||
    step === STEP.ANALYZING ||
    step === STEP.SUBMITTING;

  // ── Done ────────────────────────────────────────────────────────────────────
  if (step === STEP.DONE) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
        <CheckCircle2 size={48} className="text-green-500" />
        <h2 className="text-lg font-semibold text-gray-900">Report submitted!</h2>
        <p className="text-sm text-gray-500">
          The report is now confirmed and visible on the map.
        </p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 rounded-lg bg-regavim-blue text-white text-sm font-medium hover:bg-regavim-blue/90 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-regavim-navy">New Report</h2>
        <button
          onClick={() => { cancelAndCleanup(); onClose?.(); }}
          aria-label="Close form"
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5 px-6 py-5">

        {/* ── Image upload zone ──────────────────────────────────────────────── */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/tiff"
          className="hidden"
          aria-label="Upload image"
          onChange={onFileInputChange}
          disabled={isBusy || step === STEP.READY}
          data-testid="file-input"
        />

        {!imagePreview ? (
          /* Idle drop zone */
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 w-full h-36 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-regavim-blue hover:text-regavim-blue transition-colors cursor-pointer"
            aria-label="Click to upload image"
          >
            <Upload size={28} />
            <span className="text-sm font-medium">
              Drop image here or click to browse
            </span>
            <span className="text-xs">JPEG · PNG · TIFF</span>
          </button>
        ) : (
          /* Preview + progress */
          <div className="relative rounded-xl overflow-hidden shadow-sm">
            <img
              src={imagePreview}
              alt="Preview of selected image"
              className="w-full h-44 object-cover"
            />

            {/* Busy overlay */}
            {isBusy && (
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                <Loader2 size={28} className="text-white animate-spin" />
                <p className="text-white text-sm font-medium">
                  {STEP_LABEL[step]}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Error banner ───────────────────────────────────────────────────── */}
        {step === STEP.ERROR && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-1 underline text-red-600 hover:text-red-800 text-xs"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── Fields shown only once image is analysed ───────────────────────── */}
        {step === STEP.READY && (
          <>
            {/* AI suggestion */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-2 text-regavim-blue mb-2">
                <Sparkles size={15} />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {analysisAvailable ? 'AI Suggestion' : 'AI unavailable — please classify'}
                </span>
              </div>
              <label
                htmlFor="category"
                className="block text-xs text-gray-500 mb-1"
              >
                Violation category
              </label>
              <select
                id="category"
                value={displayedCategory}
                onChange={(e) => setFinalCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
              >
                <option value="">— select a category —</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {formatCategory(cat)}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                placeholder="Describe what you observed…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!displayedCategory}
              className="w-full rounded-lg bg-regavim-blue text-white py-2.5 text-sm font-semibold hover:bg-regavim-blue/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit Report
            </button>
          </>
        )}
      </form>
    </div>
  );
}

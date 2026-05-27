import { useRef, useState, useEffect } from 'react';
import {
  Camera,
  Images,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Clock,
  X,
} from 'lucide-react';
import { useReportForm, STEP } from '../hooks/useReportForm';

// Must match MAX_IMAGE_BYTES in backend/services/image_service.py
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/tiff']);

function validateFile(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return 'Unsupported format. Please upload a JPEG, PNG, or TIFF image.';
  }
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `File is too large (${mb} MB). The maximum allowed size is 10 MB.`;
  }
  return null;
}

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
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Pipeline-result fields
  const [description, setDescription] = useState('');
  const [finalCategory, setFinalCategory] = useState('');

  // Client-side file validation error (cleared on next pick attempt)
  const [fileError, setFileError] = useState(null);

  // Capture mode: 'camera' | 'gallery' | null
  const [captureMode, setCaptureMode] = useState(null);

  // Gallery: file waiting for metadata Q&A answers
  const [pendingFile, setPendingFile] = useState(null);

  // GPS
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle'|'loading'|'ready'|'error'

  // Gallery Q&A
  const [locationChoice, setLocationChoice] = useState(null); // 'here' | 'manual'
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [timeChoice, setTimeChoice] = useState(null); // 'today' | 'custom'
  const [customDateTime, setCustomDateTime] = useState('');

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

  const displayedCategory = finalCategory || aiCategory || '';

  const isBusy =
    step === STEP.UPLOADING ||
    step === STEP.ANALYZING ||
    step === STEP.SUBMITTING;

  // ── GPS ─────────────────────────────────────────────────────────────────────
  function startGps() {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('ready');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  function handleReset() {
    cancelAndCleanup();
    setDescription('');
    setFinalCategory('');
    setFileError(null);
    setCaptureMode(null);
    setPendingFile(null);
    setGpsCoords(null);
    setGpsStatus('idle');
    setLocationChoice(null);
    setManualLat('');
    setManualLng('');
    setTimeChoice(null);
    setCustomDateTime('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }

  // ── Camera mode ──────────────────────────────────────────────────────────────
  function handleCameraClick() {
    setCaptureMode('camera');
    startGps();
    cameraInputRef.current?.click();
  }

  function onCameraFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) { setFileError(validationError); return; }
    setFileError(null);

    if (gpsStatus === 'ready') {
      handleFileChange(file, {
        userLat:   gpsCoords.lat,
        userLng:   gpsCoords.lng,
        targetLat: gpsCoords.lat,
        targetLng: gpsCoords.lng,
        observedAt: new Date().toISOString(),
      });
    } else {
      // GPS still loading or failed — park the file and show location Q&A.
      // Time is always "now" for a freshly taken photo.
      setPendingFile(file);
      setTimeChoice('today');
      setLocationChoice(null);
      setManualLat('');
      setManualLng('');
    }
  }

  // Auto-proceed when GPS resolves while a camera photo is parked (user hasn't
  // touched the location picker yet — if they have, let them finish manually).
  useEffect(() => {
    if (captureMode !== 'camera' || !pendingFile || gpsStatus !== 'ready' || locationChoice !== null) return;
    const file = pendingFile;
    const lat  = gpsCoords.lat;
    const lng  = gpsCoords.lng;
    setPendingFile(null);
    handleFileChange(file, {
      userLat: lat, userLng: lng,
      targetLat: lat, targetLng: lng,
      observedAt: new Date().toISOString(),
    });
  }, [captureMode, pendingFile, gpsStatus, gpsCoords, handleFileChange, locationChoice]);

  // ── Gallery mode ─────────────────────────────────────────────────────────────
  function handleGalleryClick() {
    setCaptureMode('gallery');
    startGps();
    galleryInputRef.current?.click();
  }

  function onGalleryFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) { setFileError(validationError); return; }
    setFileError(null);
    setPendingFile(file);
    // Reset Q&A so the user can re-answer if they re-pick
    setLocationChoice(null);
    setManualLat('');
    setManualLng('');
    setTimeChoice(null);
    setCustomDateTime('');
  }

  // Q&A submit — passes collected metadata into the upload pipeline
  function handleMetadataSubmit(e) {
    e.preventDefault();
    const userLat = gpsCoords?.lat ?? null;
    const userLng = gpsCoords?.lng ?? null;
    const targetLat = locationChoice === 'manual' ? (parseFloat(manualLat) || null) : userLat;
    const targetLng = locationChoice === 'manual' ? (parseFloat(manualLng) || null) : userLng;
    const observedAt =
      timeChoice === 'today'
        ? new Date().toISOString()
        : customDateTime
          ? new Date(customDateTime).toISOString()
          : null;

    handleFileChange(pendingFile, { userLat, userLng, targetLat, targetLng, observedAt });
    setPendingFile(null);
  }

  // Metadata "Continue" disabled until both questions are answered and valid
  const metadataReady =
    locationChoice !== null &&
    timeChoice !== null &&
    (locationChoice !== 'manual' || (manualLat.trim() && manualLng.trim())) &&
    !(locationChoice === 'here' && gpsStatus === 'loading');

  // ── Submit pipeline result ───────────────────────────────────────────────────
  async function onSubmit(e) {
    e.preventDefault();
    await handleSubmit({ description, finalCategory: displayedCategory || null });
    if (step !== STEP.ERROR) onSubmitted?.();
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
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
      {/* ── Hidden file inputs ───────────────────────────────────────────────── */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/tiff"
        capture="environment"
        className="hidden"
        aria-label="Camera capture"
        onChange={onCameraFileChange}
        data-testid="camera-input"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/tiff"
        className="hidden"
        aria-label="Gallery upload"
        onChange={onGalleryFileChange}
        data-testid="gallery-input"
      />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-regavim-navy">New Report</h2>
        <button
          onClick={() => { handleReset(); onClose?.(); }}
          aria-label="Close form"
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Phase 1: Mode selector ────────────────────────────────────────────── */}
      {step === STEP.IDLE && !pendingFile && (
        <div className="flex flex-col gap-4 px-6 py-6">
          <p className="text-sm text-gray-500 text-center">
            How would you like to add the evidence photo?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleCameraClick}
              aria-label="Take photo"
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 hover:border-regavim-blue hover:text-regavim-blue transition-colors"
            >
              <Camera size={28} />
              <span className="text-xs font-medium">Take Photo</span>
              <span className="text-xs text-gray-400">Live camera</span>
            </button>
            <button
              type="button"
              onClick={handleGalleryClick}
              aria-label="Choose from gallery"
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 hover:border-regavim-blue hover:text-regavim-blue transition-colors"
            >
              <Images size={28} />
              <span className="text-xs font-medium">Choose Photo</span>
              <span className="text-xs text-gray-400">From device</span>
            </button>
          </div>
          {fileError && (
            <div
              role="alert"
              data-testid="file-error"
              className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700"
            >
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{fileError}</span>
            </div>
          )}
          <p className="text-xs text-gray-400 text-center">JPEG · PNG · TIFF · max 10 MB</p>
        </div>
      )}

      {/* ── Phase 2: Metadata Q&A (gallery always; camera only when GPS unavailable) */}
      {step === STEP.IDLE && pendingFile && (
        <form onSubmit={handleMetadataSubmit} className="flex flex-col gap-5 px-6 py-5">
          {/* Selected file name */}
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
            {captureMode === 'camera' ? (
              <Camera size={14} className="flex-shrink-0 text-regavim-blue" />
            ) : (
              <Images size={14} className="flex-shrink-0 text-regavim-blue" />
            )}
            <span className="truncate">
              {captureMode === 'camera' ? 'Photo captured' : pendingFile.name}
            </span>
            {captureMode === 'camera' && gpsStatus === 'loading' && (
              <span className="ml-auto flex items-center gap-1 text-gray-400">
                <Loader2 size={11} className="animate-spin" />
                <span>GPS…</span>
              </span>
            )}
          </div>

          {/* Location question */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-regavim-blue">
              <MapPin size={14} />
              <p className="text-xs font-semibold uppercase tracking-wide">
                Where was this photo taken?
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="location"
                value="here"
                checked={locationChoice === 'here'}
                onChange={() => setLocationChoice('here')}
                className="accent-regavim-blue"
              />
              <span className="text-sm text-gray-700">
                I&apos;m at the location right now
                {locationChoice === 'here' && gpsStatus === 'loading' && (
                  <Loader2 size={12} className="inline ml-1 animate-spin text-gray-400" />
                )}
                {locationChoice === 'here' && gpsStatus === 'ready' && (
                  <CheckCircle2 size={12} className="inline ml-1 text-green-500" />
                )}
                {locationChoice === 'here' && gpsStatus === 'error' && (
                  <span className="ml-1 text-amber-500 text-xs">(GPS unavailable)</span>
                )}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="location"
                value="manual"
                checked={locationChoice === 'manual'}
                onChange={() => setLocationChoice('manual')}
                className="accent-regavim-blue"
              />
              <span className="text-sm text-gray-700">Somewhere else — I&apos;ll enter coordinates</span>
            </label>

            {locationChoice === 'manual' && (
              <div className="grid grid-cols-2 gap-2 ml-5">
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 31.7683"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    aria-label="Target latitude"
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 35.2137"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    aria-label="Target longitude"
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Time question — hidden for camera (always "now") */}
          {captureMode !== 'camera' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-regavim-blue">
                <Clock size={14} />
                <p className="text-xs font-semibold uppercase tracking-wide">
                  When was this photo taken?
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="time"
                  value="today"
                  checked={timeChoice === 'today'}
                  onChange={() => setTimeChoice('today')}
                  className="accent-regavim-blue"
                />
                <span className="text-sm text-gray-700">Today (right now)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="time"
                  value="custom"
                  checked={timeChoice === 'custom'}
                  onChange={() => setTimeChoice('custom')}
                  className="accent-regavim-blue"
                />
                <span className="text-sm text-gray-700">Another date &amp; time</span>
              </label>

              {timeChoice === 'custom' && (
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  aria-label="Observation date and time"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
                />
              )}
            </div>
          )}

          {/* Q&A actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPendingFile(null); setCaptureMode(null); }}
              className="flex-1 rounded-lg border border-gray-200 text-gray-500 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={!metadataReady}
              className="flex-1 rounded-lg bg-regavim-blue text-white py-2.5 text-sm font-semibold hover:bg-regavim-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Continue
            </button>
          </div>
        </form>
      )}

      {/* ── Phase 3+: Upload / analyse / ready pipeline ───────────────────────── */}
      {step !== STEP.IDLE && (
        <form onSubmit={onSubmit} className="flex flex-col gap-5 px-6 py-5">
          {/* Image preview + busy overlay */}
          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden shadow-sm">
              <img
                src={imagePreview}
                alt="Preview of selected image"
                className="w-full h-44 object-cover"
              />
              {isBusy && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                  <Loader2 size={28} className="text-white animate-spin" />
                  <p className="text-white text-sm font-medium">{STEP_LABEL[step]}</p>
                </div>
              )}
            </div>
          )}

          {/* Error banner */}
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

          {/* Fields shown only once image is analysed */}
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
                <label htmlFor="category" className="block text-xs text-gray-500 mb-1">
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
                <label htmlFor="description" className="block text-xs font-medium text-gray-600 mb-1">
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
      )}
    </div>
  );
}

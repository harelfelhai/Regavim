import { useRef, useState, useEffect } from 'react';
import {
  Camera,
  Images,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
} from 'lucide-react';
import { useReportForm, STEP } from '../hooks/useReportForm';
import LocationPicker from './LocationPicker';
import CameraCapture, { isMobileDevice } from './CameraCapture';

// Must match MAX_IMAGE_BYTES in backend/services/image_service.py
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 2048; // Longest side after auto-compression
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/tiff']);

function validateFileType(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return 'פורמט לא נתמך. יש להעלות תמונה בפורמט JPEG, PNG, או TIFF.';
  }
  return null;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Auto-compress oversize images on-device so users never see "file too large".
async function compressIfNeeded(file) {
  if (file.size <= MAX_FILE_BYTES) return file;
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth  * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_FILE_BYTES) {
      return new File([blob], newName, { type: 'image/jpeg' });
    }
  }
  throw new Error('לא ניתן לכווץ את התמונה מתחת ל-10 MB.');
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

const CATEGORY_LABELS = {
  ILLEGAL_CONSTRUCTION:      'בנייה לא חוקית',
  LAND_GRADING:              'עבודות עפר',
  AGRICULTURAL_ENCROACHMENT: 'השתלטות על קרקע חקלאית',
  ROAD_PAVING:               'סלילת דרך',
  DEMOLITION:                'הריסה',
  ILLEGAL_DUMPING:           'השלכת פסולת',
  OTHER:                     'אחר',
};

function formatCategory(cat) {
  return cat ? (CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ')) : '—';
}

const STEP_LABEL = {
  [STEP.UPLOADING]:  'מעלה תמונה...',
  [STEP.ANALYZING]:  'מנתח עם AI...',
  [STEP.SUBMITTING]: 'שולח דיווח...',
};

/**
 * @param {Object} props
 * @param {Function} props.onClose
 * @param {Function} props.onSubmitted
 * @param {{ lat: number, lng: number } | null} [props.initialTarget]
 *   Pre-fill the location picker — e.g. set when the user starts a report
 *   by clicking on the main map.
 */
export default function ReportForm({ onClose, onSubmitted, initialTarget = null }) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [description, setDescription] = useState('');
  const [finalCategory, setFinalCategory] = useState('');
  const [fileError, setFileError] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Capture mode: 'camera' | 'gallery' | null
  const [captureMode, setCaptureMode] = useState(null);

  // File waiting for metadata Q&A answers before upload starts
  const [pendingFile, setPendingFile] = useState(null);

  // Live in-browser camera preview (desktop). On mobile we use the native
  // file input + capture attribute instead because it opens the OS camera.
  const [showCamera, setShowCamera] = useState(false);

  // GPS — photographer's position (used for the user_* fields and as the
  // initial guess for the violation-site pin).
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle'|'loading'|'ready'|'error'

  // The pin coordinate from LocationPicker — this is the *violation site*,
  // which may differ from the phone's GPS reading.
  const [targetCoords, setTargetCoords] = useState(initialTarget);

  // Time question — only shown for gallery mode (camera = always "now")
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
  // Two-tier strategy: try high-accuracy first (real GPS, 20 s for a cold
  // fix); on timeout/error, fall back to low-accuracy (WiFi/IP geolocation,
  // 20 s more). This dramatically reduces "GPS unavailable" false negatives
  // when the device's GPS is still warming up after being toggled on.
  function startGps() {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }
    setGpsStatus('loading');

    const onSuccess = (pos) => {
      setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsStatus('ready');
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          () => setGpsStatus('error'),
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  function handleReset() {
    cancelAndCleanup();
    setDescription('');
    setFinalCategory('');
    setFileError(null);
    setIsCompressing(false);
    setCaptureMode(null);
    setPendingFile(null);
    setGpsCoords(null);
    setGpsStatus('idle');
    setTargetCoords(initialTarget);
    setTimeChoice(null);
    setCustomDateTime('');
    setShowCamera(false);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }

  // ── Camera mode ──────────────────────────────────────────────────────────────
  function handleCameraClick() {
    setCaptureMode('camera');
    startGps();
    if (isMobileDevice()) {
      // On mobile, the native input + capture="environment" opens the OS
      // camera — better UX than a custom in-browser preview.
      cameraInputRef.current?.click();
    } else {
      // On desktop, open the in-browser live camera preview.
      setShowCamera(true);
    }
  }

  // Shared post-validation handler — called by both the native file-input
  // change event (mobile) and the in-browser camera snapshot (desktop).
  async function processCameraFile(raw) {
    const typeError = validateFileType(raw);
    if (typeError) { setFileError(typeError); return; }
    setFileError(null);

    let file = raw;
    if (raw.size > MAX_FILE_BYTES) {
      setIsCompressing(true);
      try { file = await compressIfNeeded(raw); }
      catch { setFileError('לא ניתן לעבד את התמונה — נסה/י תמונה אחרת.'); setIsCompressing(false); return; }
      setIsCompressing(false);
    }

    // Always show the location confirmation step. The pin defaults to GPS
    // (if available) so a user on-site can confirm with one click; but they
    // can also drag it if the violation is elsewhere.
    setPendingFile(file);
    setTimeChoice('today'); // Camera = "now"
  }

  async function onCameraFileChange(e) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    await processCameraFile(raw);
  }

  function handleCameraCapture(file) {
    setShowCamera(false);
    processCameraFile(file);
  }

  function handleCameraFallback() {
    // User clicked "use a file instead" inside the camera modal (e.g. when
    // permission was denied). Open the native file input.
    setShowCamera(false);
    cameraInputRef.current?.click();
  }

  // ── Gallery mode ─────────────────────────────────────────────────────────────
  function handleGalleryClick() {
    setCaptureMode('gallery');
    startGps();
    galleryInputRef.current?.click();
  }

  async function onGalleryFileChange(e) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    const typeError = validateFileType(raw);
    if (typeError) { setFileError(typeError); return; }
    setFileError(null);

    let file = raw;
    if (raw.size > MAX_FILE_BYTES) {
      setIsCompressing(true);
      try { file = await compressIfNeeded(raw); }
      catch { setFileError('לא ניתן לעבד את התמונה — נסה/י תמונה אחרת.'); setIsCompressing(false); return; }
      setIsCompressing(false);
    }

    setPendingFile(file);
    // Reset Q&A so the user can re-answer if they re-pick
    if (initialTarget == null) setTargetCoords(null);
    setTimeChoice(null);
    setCustomDateTime('');
  }

  // Q&A submit — passes collected metadata into the upload pipeline
  function handleMetadataSubmit(e) {
    e.preventDefault();
    const observedAt =
      timeChoice === 'today'
        ? new Date().toISOString()
        : customDateTime
          ? new Date(customDateTime).toISOString()
          : null;

    handleFileChange(pendingFile, {
      userLat:   gpsCoords?.lat ?? null,
      userLng:   gpsCoords?.lng ?? null,
      targetLat: targetCoords?.lat ?? null,
      targetLng: targetCoords?.lng ?? null,
      observedAt,
    });
    setPendingFile(null);
  }

  // "Continue" disabled until target pin is set AND time is answered.
  const metadataReady =
    targetCoords != null &&
    timeChoice !== null &&
    (timeChoice !== 'custom' || customDateTime !== '');

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
        <h2 className="text-lg font-semibold text-gray-900">הדיווח נשלח!</h2>
        <p className="text-sm text-gray-500">
          הדיווח אושר ומוצג במפה.
        </p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 rounded-lg bg-regavim-blue text-white text-sm font-medium hover:bg-regavim-blue/90 transition-colors"
        >
          סגור
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Desktop in-browser camera ─────────────────────────────────────────── */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
          onFallbackToFile={handleCameraFallback}
        />
      )}

      {/* ── Hidden file inputs ───────────────────────────────────────────────── */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/tiff"
        capture="environment"
        className="hidden"
        aria-label="צילום מצלמה"
        onChange={onCameraFileChange}
        data-testid="camera-input"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/tiff"
        className="hidden"
        aria-label="העלאה מהגלריה"
        onChange={onGalleryFileChange}
        data-testid="gallery-input"
      />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-regavim-navy">דיווח חדש</h2>
        <button
          onClick={() => { handleReset(); onClose?.(); }}
          aria-label="סגירת הטופס"
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Phase 1: Mode selector ────────────────────────────────────────────── */}
      {step === STEP.IDLE && !pendingFile && (
        <div className="flex flex-col gap-4 px-6 py-6">
          <p className="text-sm text-gray-500 text-center">
            כיצד תרצה/י להוסיף את תמונת הראיה?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleCameraClick}
              aria-label="צלם תמונה"
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 hover:border-regavim-blue hover:text-regavim-blue transition-colors"
            >
              <Camera size={28} />
              <span className="text-xs font-medium">צלם תמונה</span>
              <span className="text-xs text-gray-400">מצלמה חיה</span>
            </button>
            <button
              type="button"
              onClick={handleGalleryClick}
              aria-label="בחר מהגלריה"
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 hover:border-regavim-blue hover:text-regavim-blue transition-colors"
            >
              <Images size={28} />
              <span className="text-xs font-medium">בחר תמונה</span>
              <span className="text-xs text-gray-400">מהמכשיר</span>
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
          {isCompressing && (
            <div
              role="status"
              data-testid="compressing-indicator"
              className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-regavim-blue"
            >
              <Loader2 size={14} className="animate-spin flex-shrink-0" />
              <span>התמונה גדולה — נדחסת להעלאה...</span>
            </div>
          )}
          <p className="text-xs text-gray-400 text-center">JPEG · PNG · TIFF · תמונות גדולות נדחסות אוטומטית</p>
        </div>
      )}

      {/* ── Phase 2: Metadata Q&A ──────────────────────────────────────────── */}
      {step === STEP.IDLE && pendingFile && (
        <form
          onSubmit={handleMetadataSubmit}
          className="flex flex-col gap-5 px-6 py-5 max-h-[80vh] overflow-y-auto"
          data-testid="metadata-form"
        >
          {/* Selected file indicator */}
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
            {captureMode === 'camera' ? (
              <Camera size={14} className="flex-shrink-0 text-regavim-blue" />
            ) : (
              <Images size={14} className="flex-shrink-0 text-regavim-blue" />
            )}
            <span className="truncate">
              {captureMode === 'camera' ? 'תמונה צולמה' : pendingFile.name}
            </span>
          </div>

          {/* Location picker (mini-map) */}
          <LocationPicker
            initialPin={initialTarget}
            gpsCoords={gpsCoords}
            gpsStatus={gpsStatus}
            onRetryGps={startGps}
            onChange={setTargetCoords}
          />

          {/* Time question — gallery only (camera = always "now") */}
          {captureMode !== 'camera' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-regavim-blue">
                <Clock size={14} />
                <p className="text-xs font-semibold uppercase tracking-wide">
                  מתי צולמה התמונה?
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
                <span className="text-sm text-gray-700">היום (כרגע)</span>
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
                <span className="text-sm text-gray-700">תאריך ושעה אחרים</span>
              </label>

              {timeChoice === 'custom' && (
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  aria-label="תאריך ושעה של צפייה"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
                />
              )}
            </div>
          )}

          {/* Q&A actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setPendingFile(null); setCaptureMode(null); }}
              className="flex-1 rounded-lg border border-gray-200 text-gray-500 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              חזרה
            </button>
            <button
              type="submit"
              disabled={!metadataReady}
              className="flex-1 rounded-lg bg-regavim-blue text-white py-2.5 text-sm font-semibold hover:bg-regavim-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              המשך
            </button>
          </div>
        </form>
      )}

      {/* ── Phase 3+: Upload / analyse / ready pipeline ───────────────────────── */}
      {step !== STEP.IDLE && (
        <form onSubmit={onSubmit} className="flex flex-col gap-5 px-6 py-5">
          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden shadow-sm">
              <img
                src={imagePreview}
                alt="תצוגה מקדימה של התמונה הנבחרת"
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
                  נסה/י שוב
                </button>
              </div>
            </div>
          )}

          {step === STEP.READY && (
            <>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="flex items-center gap-2 text-regavim-blue mb-2">
                  <Sparkles size={15} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {analysisAvailable ? 'הצעת AI' : 'AI לא זמין — אנא סווג/י'}
                  </span>
                </div>
                <label htmlFor="category" className="block text-xs text-gray-500 mb-1">
                  קטגוריית עבירה
                </label>
                <select
                  id="category"
                  value={displayedCategory}
                  onChange={(e) => setFinalCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
                >
                  <option value="">— בחר קטגוריה —</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {formatCategory(cat)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="description" className="block text-xs font-medium text-gray-600 mb-1">
                  תיאור
                </label>
                <textarea
                  id="description"
                  rows={3}
                  placeholder="תאר/י את שנצפה..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-regavim-blue/40"
                />
              </div>

              <button
                type="submit"
                disabled={!displayedCategory}
                className="w-full rounded-lg bg-regavim-blue text-white py-2.5 text-sm font-semibold hover:bg-regavim-blue/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                שלח דיווח
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}

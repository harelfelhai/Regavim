import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, Loader2, AlertCircle, FolderOpen } from 'lucide-react';

/**
 * Live camera capture using navigator.mediaDevices.getUserMedia.
 * Used on desktop where the file input + capture attribute falls back to a
 * file picker. On mobile, the native file input is preferred (better UX
 * because it opens the OS camera app).
 *
 * @param {Object} props
 * @param {(file: File) => void} props.onCapture
 * @param {() => void} props.onClose
 * @param {() => void} [props.onFallbackToFile] - Open a file picker as fallback
 *   when the camera cannot be accessed (denied permission, no camera, etc.).
 */
export default function CameraCapture({ onCapture, onClose, onFallbackToFile }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('starting'); // 'starting' | 'live' | 'error'
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [snapshot, setSnapshot] = useState(null); // { blob, url } for preview before confirm

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('הדפדפן אינו תומך בגישה למצלמה.');
      return;
    }

    let cancelled = false;
    setStatus('starting');
    setError(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus('live');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('הגישה למצלמה נדחתה. אפשר/י גישה בהגדרות הדפדפן ונסה/י שוב.');
        } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
          setError('לא נמצאה מצלמה זמינה במכשיר זה.');
        } else if (err.name === 'NotReadableError') {
          setError('המצלמה תפוסה על-ידי תוכנה אחרת. סגור/י את שאר היישומים ונסה/י שוב.');
        } else {
          setError(`לא ניתן לפתוח את המצלמה: ${err.message}`);
        }
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [facingMode]);

  // Revoke the snapshot URL when it changes or component unmounts.
  useEffect(() => {
    return () => {
      if (snapshot?.url) URL.revokeObjectURL(snapshot.url);
    };
  }, [snapshot]);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function handleClose() {
    stopStream();
    onClose?.();
  }

  function snap() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setSnapshot({ blob, url });
      },
      'image/jpeg',
      0.92,
    );
  }

  function confirmSnapshot() {
    if (!snapshot) return;
    const file = new File([snapshot.blob], `camera-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    stopStream();
    onCapture(file);
  }

  function retake() {
    if (snapshot?.url) URL.revokeObjectURL(snapshot.url);
    setSnapshot(null);
  }

  function switchCamera() {
    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
  }

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/90 flex flex-col"
      data-testid="camera-capture"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button
          type="button"
          onClick={handleClose}
          aria-label="סגור מצלמה"
          className="p-1.5 rounded-md hover:bg-white/10"
        >
          <X size={22} />
        </button>
        <span className="text-sm font-medium">צילום תמונה</span>
        {status === 'live' && !snapshot && (
          <button
            type="button"
            onClick={switchCamera}
            aria-label="החלף מצלמה"
            className="p-1.5 rounded-md hover:bg-white/10"
          >
            <RefreshCw size={20} />
          </button>
        )}
        {(status !== 'live' || snapshot) && <div className="w-8" />}
      </div>

      {/* Preview area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {status === 'starting' && (
          <div className="text-white text-sm flex items-center gap-2">
            <Loader2 size={18} className="animate-spin" />
            פותח מצלמה...
          </div>
        )}

        {status === 'error' && (
          <div className="px-6 max-w-sm">
            <div className="flex flex-col items-center text-center gap-3 text-white">
              <AlertCircle size={36} className="text-amber-400" />
              <p className="text-sm">{error}</p>
              {onFallbackToFile && (
                <button
                  type="button"
                  onClick={() => {
                    stopStream();
                    onFallbackToFile();
                  }}
                  className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                >
                  <FolderOpen size={16} />
                  בחר/י קובץ במקום
                </button>
              )}
            </div>
          </div>
        )}

        {/* Live video — hidden while a snapshot is being reviewed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`max-h-full max-w-full ${
            status === 'live' && !snapshot ? '' : 'hidden'
          }`}
          data-testid="camera-video"
        />

        {/* Snapshot preview before confirm */}
        {snapshot && (
          <img
            src={snapshot.url}
            alt="תצוגת תמונה שצולמה"
            className="max-h-full max-w-full"
            data-testid="camera-snapshot"
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-4 py-6 flex items-center justify-center gap-6">
        {status === 'live' && !snapshot && (
          <button
            type="button"
            onClick={snap}
            aria-label="צלם"
            data-testid="snap-button"
            className="w-16 h-16 rounded-full bg-white border-4 border-white/40 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
          >
            <Camera size={28} className="text-gray-800" />
          </button>
        )}

        {snapshot && (
          <>
            <button
              type="button"
              onClick={retake}
              data-testid="retake-button"
              className="px-5 py-2 rounded-lg border border-white/30 text-white text-sm font-medium hover:bg-white/10"
            >
              צלם/י שוב
            </button>
            <button
              type="button"
              onClick={confirmSnapshot}
              data-testid="confirm-snapshot-button"
              className="px-6 py-2 rounded-lg bg-regavim-blue text-white text-sm font-semibold hover:bg-regavim-blue/90"
            >
              השתמש בתמונה זו
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Heuristic for choosing between the native file-input + capture attribute
// (which on mobile opens the OS camera app — the best UX) vs the in-browser
// getUserMedia preview (best for desktop where the file input falls back to
// a file picker).
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return (
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    navigator.maxTouchPoints > 1
  );
}

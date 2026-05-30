import { useEffect, useRef, useState } from 'react';

/**
 * Draggable bottom sheet for the mobile dashboard — the map stays full-screen
 * behind it and the sheet slides up from the bottom edge (Google-Maps style).
 *
 * Three snap points, controlled by the parent:
 *   - 'peek'  → only the drag handle + summary header are visible
 *   - 'half'  → ~55% of the viewport
 *   - 'full'  → ~92% of the viewport
 *
 * The sheet is always full-height (92vh); `translateY` pushes it down to reveal
 * just the requested portion. Dragging the handle snaps to the nearest point;
 * tapping it steps up one level (and collapses back to 'peek' from 'full').
 *
 * Props:
 *   snap          — current snap: 'peek' | 'half' | 'full'
 *   onSnapChange  — (snap) => void, called when the user drags/taps to a new snap
 *   children      — sheet content (header row, scrollable body, footer)
 */
const SNAPS = ['peek', 'half', 'full'];
const PEEK_PX = 88; // handle (~24px) + one summary row (~64px)

function visibleHeight(snap, viewportH) {
  if (snap === 'full') return Math.round(viewportH * 0.92);
  if (snap === 'half') return Math.round(viewportH * 0.55);
  return PEEK_PX;
}

export default function MobileBottomSheet({ snap, onSnapChange, children }) {
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  // Live drag offset in px; null when no drag is in progress.
  const [dragY, setDragY] = useState(null);
  const startRef = useRef(null);   // { y, base } captured on touchstart
  const draggedRef = useRef(false); // distinguishes a tap from a drag

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sheetH = Math.round(viewportH * 0.92);
  const translateForSnap = (s) => sheetH - visibleHeight(s, viewportH);
  const maxTranslate = sheetH - PEEK_PX; // fully collapsed
  const baseTranslate = translateForSnap(snap);
  const translateY = dragY != null ? dragY : baseTranslate;

  function handleTouchStart(e) {
    startRef.current = { y: e.touches[0].clientY, base: baseTranslate };
    draggedRef.current = false;
  }

  function handleTouchMove(e) {
    if (!startRef.current) return;
    const dy = e.touches[0].clientY - startRef.current.y;
    if (Math.abs(dy) > 4) draggedRef.current = true;
    const next = Math.max(0, Math.min(startRef.current.base + dy, maxTranslate));
    setDragY(next);
  }

  function handleTouchEnd() {
    if (dragY == null) {
      startRef.current = null;
      return;
    }
    // Snap to the nearest of the three points.
    let best = SNAPS[0];
    let bestDist = Infinity;
    for (const s of SNAPS) {
      const dist = Math.abs(translateForSnap(s) - dragY);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    setDragY(null);
    startRef.current = null;
    if (best !== snap) onSnapChange(best);
  }

  // Tap (no drag) steps up one level; from 'full' it collapses back to 'peek'.
  function handleHandleClick() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const idx = SNAPS.indexOf(snap);
    const next = snap === 'full' ? 'peek' : SNAPS[idx + 1] ?? 'full';
    onSnapChange(next);
  }

  return (
    <div
      data-testid="mobile-bottom-sheet"
      data-snap={snap}
      className="sm:hidden fixed inset-x-0 bottom-0 z-[900] bg-regavim-surface rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] flex flex-col"
      style={{
        height: `${sheetH}px`,
        transform: `translateY(${translateY}px)`,
        transition: dragY != null ? 'none' : 'transform 0.3s ease-in-out',
      }}
    >
      <button
        type="button"
        onClick={handleHandleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        aria-label="הרחב או כווץ את רשימת הדיווחים"
        className="flex-shrink-0 w-full pt-2.5 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <span className="block h-1.5 w-10 rounded-full bg-gray-300" />
      </button>
      {children}
    </div>
  );
}

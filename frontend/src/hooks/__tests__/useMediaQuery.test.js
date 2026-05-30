import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from '../useMediaQuery';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('useMediaQuery', () => {
  it('returns true when the query matches', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(false);
  });

  it('subscribes to and unsubscribes from change events', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener,
      removeEventListener,
    }));

    const { unmount } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('falls back to false when matchMedia is unavailable', () => {
    // @ts-expect-error — intentionally remove for the fallback path
    window.matchMedia = undefined;
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(false);
  });
});

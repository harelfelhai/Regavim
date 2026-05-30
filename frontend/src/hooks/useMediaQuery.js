import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and re-render when it changes.
 *
 * Falls back to `false` in environments without `matchMedia` (jsdom / SSR),
 * so test and server renders default to the desktop layout.
 *
 * @param {string} query e.g. '(max-width: 639px)'
 * @returns {boolean} whether the query currently matches
 */
export function useMediaQuery(query) {
  const getMatch = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    // Sync immediately in case the query changed between render and effect.
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export default useMediaQuery;

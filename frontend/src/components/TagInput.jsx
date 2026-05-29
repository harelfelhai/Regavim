import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { X, Tag } from 'lucide-react';
import { fetchTags } from '../services/reports';

/**
 * Free-text tag chip input with server-side autocomplete.
 *
 * Exposes a `commitPending()` imperative handle via forwardRef so a parent
 * form can flush any uncommitted typed text before submission without waiting
 * for the user to press Enter.  commitPending() returns the resulting tag
 * array (or null when there was nothing to commit) so the caller can use the
 * up-to-date value synchronously before React re-renders.
 *
 * @param {Object}   props
 * @param {string[]} props.value       - Current tag list (controlled)
 * @param {Function} props.onChange    - Called with the new tag array
 * @param {string}   [props.placeholder]
 * @param {boolean}  [props.disabled]
 */
const TagInput = forwardRef(function TagInput({ value = [], onChange, placeholder = 'הוסף תגית...', disabled = false }, ref) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q.trim()) { setSuggestions([]); return; }
    try {
      const all = await fetchTags(q);
      // Exclude tags already in the list.
      setSuggestions(all.filter((t) => !value.includes(t)));
    } catch {
      setSuggestions([]);
    }
  }, [value]);

  // Debounce the autocomplete fetch.
  function handleInputChange(e) {
    const q = e.target.value;
    setInputValue(q);
    setActiveSuggestion(-1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 250);
    setShowSuggestions(true);
  }

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Flush any uncommitted typed text as a new tag. Returns the resulting tag
  // array so the caller can use it synchronously (before React re-renders),
  // or null when there was nothing pending.
  useImperativeHandle(ref, () => ({
    commitPending() {
      const tag = inputValue.trim().replace(/,+$/, '').trim();
      if (!tag || value.includes(tag)) return null;
      const next = [...value, tag];
      onChange(next);
      setInputValue('');
      setSuggestions([]);
      return next;
    },
  }), [inputValue, value, onChange]);

  function addTag(raw) {
    const tag = raw.trim().replace(/,+$/, '').trim();
    if (!tag || value.includes(tag)) { setInputValue(''); setSuggestions([]); return; }
    onChange([...value, tag]);
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  }

  function removeTag(tag) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestion((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === 'Enter' && activeSuggestion >= 0) {
        e.preventDefault();
        addTag(suggestions[activeSuggestion]);
        return;
      }
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  function handleBlur() {
    // Small delay so a suggestion click fires before the input loses focus.
    setTimeout(() => setShowSuggestions(false), 150);
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[2.25rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-regavim-blue/40 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        <Tag size={13} className="text-regavim-blue/60 flex-shrink-0" />
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-regavim-blue/10 text-regavim-blue px-2 py-0.5 text-xs font-medium"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`הסר תגית ${tag}`}
                className="hover:text-red-500 transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => inputValue && setShowSuggestions(true)}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? placeholder : ''}
            aria-label="שדה הוספת תגית"
            className="flex-1 min-w-[6rem] bg-transparent outline-none text-xs text-gray-700 placeholder-gray-400"
          />
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-auto max-h-40"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === activeSuggestion}
              onMouseDown={() => addTag(s)}
              className={`px-3 py-1.5 text-xs cursor-pointer select-none ${
                i === activeSuggestion ? 'bg-regavim-blue/10 text-regavim-blue' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default TagInput;

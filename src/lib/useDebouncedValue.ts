import { useEffect, useState } from 'react';

/**
 * Returns `value`, but only after it's stopped changing for `delayMs`.
 * Used to stop every keystroke in the search box from becoming a request.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
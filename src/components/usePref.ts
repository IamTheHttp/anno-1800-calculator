import { useState } from 'react';

/** A small per-viewer preference kept in localStorage. */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const full = `anno1800-planner:pref:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(full);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(full, JSON.stringify(v));
    } catch {
      // Preferences are a convenience; losing them is harmless.
    }
  };
  return [value, set];
}

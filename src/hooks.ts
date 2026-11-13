import { useCallback, useEffect, useState } from 'react';

/** Hash-based routing: "#/tool?key=value". Keeps the app static-hostable and links shareable. */
export function readHash(): { path: string; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const i = raw.indexOf('?');
  const path = i >= 0 ? raw.slice(0, i) : raw;
  return { path: path || '/', params: new URLSearchParams(i >= 0 ? raw.slice(i + 1) : '') };
}

export function useRoute(): string {
  const [path, setPath] = useState(() => readHash().path);
  useEffect(() => {
    const onChange = () => setPath(readHash().path);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

/**
 * String state mirrored into the URL hash query, so the current inputs can be
 * bookmarked or shared. Default values are left out of the URL.
 */
export function useQueryState(key: string, defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => readHash().params.get(key) ?? defaultValue);
  const update = useCallback(
    (v: string) => {
      setValue(v);
      const { path, params } = readHash();
      if (v === defaultValue) params.delete(key);
      else params.set(key, v);
      const qs = params.toString();
      window.history.replaceState(null, '', `#${path}${qs ? `?${qs}` : ''}`);
    },
    [key, defaultValue],
  );
  return [value, update];
}

/** Number-valued variant of useQueryState. */
export function useQueryNumber(key: string, defaultValue: number): [number, (v: number) => void] {
  const [raw, setRaw] = useQueryState(key, String(defaultValue));
  const n = Number(raw);
  return [Number.isFinite(n) ? n : defaultValue, (v: number) => setRaw(String(v))];
}

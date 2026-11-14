/** Routeur minimal fondé sur le fragment d'URL (#/…). */
import { useSyncExternalStore } from 'react';

function current(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, current, () => '/');
  return path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string) {
  if (current() !== path) window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}

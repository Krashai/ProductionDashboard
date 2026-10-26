'use client'

import { useEffect } from 'react';
import { faviconDataUri } from '@/lib/brand/favicon';
import { prefersReducedMotion } from '@/lib/brand/reduced-motion';
import { winkScheduler } from '@/lib/brand/wink-scheduler';
import type { LensColor } from '@/lib/brand/wink-timeline';

// `~=` łapie też `rel="shortcut icon"`, ale nie `apple-touch-icon`. Linki bez
// `href` pomijamy — nie ma czego przywracać.
const ICON_LINK_SELECTOR = 'link[rel~="icon"][href]';
const ORIGINAL_HREF_KEY = 'winkOriginalHref';
const ORIGINAL_HREF_SELECTOR = 'link[data-wink-original-href]';

function findIconLinks(): HTMLLinkElement[] {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement>(ICON_LINK_SELECTOR));
}

/**
 * Favicona mruga razem z logo: na klatkach soczewki (z tego samego schedulera
 * co `Logo`) podmienia `href` ikon na wariant czerwony/turkusowy, a po końcu
 * mrugnięcia — oraz przy wyłączeniu i odmontowaniu — przywraca oryginał.
 * Nie tworzy linku, jeśli strona go nie ma.
 */
export function useFaviconWink(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;

    const showLens = (lens: LensColor) => {
      const href = faviconDataUri(lens);
      findIconLinks().forEach((link) => {
        // Oryginał trzymany na samym linku, a nie w pamięci hooka: przy dwóch
        // włączonych hookach drugi uznałby czerwień ustawioną przez pierwszy
        // za "oryginał" i przywrócił ją po mrugnięciu.
        if (link.dataset[ORIGINAL_HREF_KEY] === undefined) {
          link.dataset[ORIGINAL_HREF_KEY] = link.getAttribute('href') ?? '';
        }
        link.setAttribute('href', href);
      });
    };
    const restore = () => {
      document.head.querySelectorAll<HTMLLinkElement>(ORIGINAL_HREF_SELECTOR).forEach((link) => {
        link.setAttribute('href', link.dataset[ORIGINAL_HREF_KEY] ?? '');
        delete link.dataset[ORIGINAL_HREF_KEY];
      });
    };

    const unsubscribe = winkScheduler.subscribe((event) => {
      if (event.type === 'lens') showLens(event.lens);
      else if (event.type === 'wink-end') restore();
    });

    return () => {
      unsubscribe();
      // Nigdy nie zostawiamy czerwonej favicony po odmontowaniu w trakcie mrugnięcia.
      restore();
    };
  }, [enabled]);
}

'use client'

import { useEffect } from 'react';
import { faviconDataUri } from '@/lib/brand/favicon';
import { prefersReducedMotion } from '@/lib/brand/reduced-motion';
import { winkScheduler } from '@/lib/brand/wink-scheduler';
import type { LensColor } from '@/lib/brand/wink-timeline';

// `~=` łapie też `rel="shortcut icon"`, ale nie `apple-touch-icon`. Linki bez
// `href` pomijamy — nie ma czego przywracać.
const ICON_LINK_SELECTOR = 'link[rel~="icon"][href]';

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

    // Oryginalne `href` zapamiętane przy pierwszej podmianie danego linku.
    const originalHrefs = new Map<HTMLLinkElement, string>();

    const showLens = (lens: LensColor) => {
      const href = faviconDataUri(lens);
      findIconLinks().forEach((link) => {
        if (!originalHrefs.has(link)) originalHrefs.set(link, link.getAttribute('href') ?? '');
        link.setAttribute('href', href);
      });
    };
    const restore = () => {
      originalHrefs.forEach((href, link) => link.setAttribute('href', href));
      originalHrefs.clear();
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

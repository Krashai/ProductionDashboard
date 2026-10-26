import type { LensColor } from '@/lib/brand/wink-timeline';

// Kolory marki — jak w `src/app/icon.svg` i `.ln-logo` w globals.css
// (turkus lampki, czerwień mrugnięcia, szara obudowa).
const LENS_FILL: Readonly<Record<LensColor, string>> = {
  teal: '#18b2a3',
  red: '#e5322d',
};
const BEZEL_COLOR = '#8a9099';

/**
 * To samo SVG co statyczna favicona `src/app/icon.svg`, tylko z kolorem
 * soczewki do wyboru. Zgodność z plikiem pilnuje `favicon.test.ts`.
 */
function faviconSvg(lens: LensColor): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    `<circle cx="16" cy="16" r="13.5" fill="none" stroke="${BEZEL_COLOR}" stroke-width="3"/>` +
    `<circle cx="16" cy="16" r="9.5" fill="${LENS_FILL[lens]}"/>` +
    '</svg>'
  );
}

/** Favicona jako `data:` URI — do podmiany `href` w `<link rel="icon">` bez dodatkowych żądań. */
export function faviconDataUri(lens: LensColor): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(lens))}`;
}

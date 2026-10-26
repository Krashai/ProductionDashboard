import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { faviconDataUri } from '@/lib/brand/favicon';

const DATA_URI_PREFIX = 'data:image/svg+xml,';

function parseSvg(markup: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc.documentElement as unknown as SVGSVGElement;
}

function decodeDataUri(uri: string): string {
  expect(uri.startsWith(DATA_URI_PREFIX)).toBe(true);
  return decodeURIComponent(uri.slice(DATA_URI_PREFIX.length));
}

/** Okręgi ikony jako zwykłe obiekty atrybutów — do porównania semantycznego, nie tekstowego. */
function describeCircles(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll('circle')).map((circle) =>
    Object.fromEntries(Array.from(circle.attributes).map((attr) => [attr.name, attr.value])),
  );
}

describe('faviconDataUri', () => {
  const staticIcon = parseSvg(readFileSync(resolve(__dirname, '../../../app/icon.svg'), 'utf8'));

  test('zwraca data URI z zakodowanym SVG (bez surowych znaków < i #)', () => {
    const uri = faviconDataUri('teal');
    expect(uri.startsWith(DATA_URI_PREFIX)).toBe(true);
    expect(uri).not.toMatch(/[<>#"]/);
  });

  // Repo nie ma CI — ten test pilnuje, żeby statyczna ikona (`src/app/icon.svg`)
  // i ta generowana w kodzie nie rozjechały się po ręcznej edycji jednej z nich.
  test('turkusowa wersja jest semantycznie identyczna z src/app/icon.svg', () => {
    const dynamicIcon = parseSvg(decodeDataUri(faviconDataUri('teal')));

    expect(dynamicIcon.getAttribute('viewBox')).toBe(staticIcon.getAttribute('viewBox'));
    expect(describeCircles(dynamicIcon)).toEqual(describeCircles(staticIcon));
  });

  test('czerwona wersja różni się od turkusowej wyłącznie kolorem soczewki', () => {
    const teal = describeCircles(parseSvg(decodeDataUri(faviconDataUri('teal'))));
    const red = describeCircles(parseSvg(decodeDataUri(faviconDataUri('red'))));

    expect(red).toHaveLength(teal.length);
    const [tealBezel, tealLens] = teal;
    const [redBezel, redLens] = red;
    expect(redBezel).toEqual(tealBezel);
    expect(redLens).toEqual({ ...tealLens, fill: '#e5322d' });
  });
});

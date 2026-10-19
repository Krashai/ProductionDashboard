// Generator logo rodziny Line (specyfikacja: brand/LOGO-SPEC.md — numery
// sekcji w komentarzach odnoszą się do niej).
// Wordmark = "Line" + końcówka WERSALIKAMI, w której pierwsze "O" zastępuje
// lampka sygnalizacyjna (szara obudowa + kolorowa soczewka). Tekst jest
// zamieniany na ścieżki — logo nie zależy od ładowania fontu w przeglądarce.
//
// Użycie: node scripts/build-logo.mjs
// Wejście: brand/fonts/Barlow-SemiBold.ttf (SIL OFL, brand/fonts/OFL.txt)
// Wyjście (dla każdego produktu z PRODUCTS):
//   public/brand/logo/{id}.svg            — wordmark, jasne tło
//   src/app/icon.svg                       — favicon (Next.js App Router)
//   src/components/brand/{id}-logo.generated.ts — dane ścieżek dla komponentu Logo
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { optimize } from 'svgo';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_PATH = resolve(ROOT, 'brand/fonts/Barlow-SemiBold.ttf');

// Dodanie produktu = jeden wpis. Ta aplikacja to LineFLOW (monitoring mediów);
// LineON (MES) zostaje poza zakresem — decyzja użytkownika "minimum dla tej
// aplikacji". `favicon` wskazuje produkt, którego lampka trafia do src/app/icon.svg.
const PRODUCTS = [{ id: 'lineflow', suffix: 'FLOW', brandLamp: '#18B2A3', favicon: true }];
// Kolor marki trafia tylko do plików SVG (działają też jako `<img>`). Komponent
// Logo.tsx bierze kolory z CSS (`.ln-logo` w globals.css) — przy zmianie
// koloru produktu popraw oba miejsca.

// Kolory z sekcji 4 specyfikacji (jasne tło — aplikacja nie ma ciemnego motywu).
const INK = '#14171C';
const BEZEL = '#8A9099';

// Geometria lampki w jednostkach H (wysokość wersalików), sekcja 3.
const BEZEL_RADIUS = 0.52; // oś obrysu obudowy
const BEZEL_STROKE = 0.08;
const BEZEL_OUTER = BEZEL_RADIUS + BEZEL_STROKE / 2; // 0.56
const LENS_RADIUS = 0.38;
const LAMP_SIDE_GAP = 0.12; // od skrajnego tuszu litery do zewn. krawędzi obudowy
// Korekta optyczna odstępu (sekcja 3, maks. ±0.03 H). Po złożeniu przy
// 20/48/200 px odstępy po obu stronach wyglądają równo — bez korekty.
const OPTICAL_GAP_CORRECTION = 0;
const MAX_OPTICAL_GAP_CORRECTION = 0.03;
if (Math.abs(OPTICAL_GAP_CORRECTION) > MAX_OPTICAL_GAP_CORRECTION) {
  throw new Error(`Korekta optyczna ${OPTICAL_GAP_CORRECTION} H poza limitem ±${MAX_OPTICAL_GAP_CORRECTION} H (sekcja 3).`);
}

// Wynikowe współrzędne zaokrąglane do 0.01 jednostki przy H = 100.
const H = 100;
const DECIMALS = 2;

// Kopia dokładnie bajtów pliku: `Buffer.buffer` może być współdzieloną pulą
// pamięci Node, większą niż sam plik.
const fontBytes = readFileSync(FONT_PATH);
const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
const capHeightUnits = font.tables.os2.sCapHeight;
if (!capHeightUnits) throw new Error('Font nie ma os2.sCapHeight — nie zgadujemy H.');
// Rozmiar fontu, przy którym wysokość wersalików = H jednostek viewBoxa.
const FONT_SIZE = (H / capHeightUnits) * font.unitsPerEm;

const round = (n) => Number(n.toFixed(DECIMALS));

/**
 * Własna serializacja zamiast `Path.toPathData` z opentype.js 2.0: tamta
 * zwraca "NaN" dla części współrzędnych ujemnych (np. lewa krawędź "L" po
 * przesunięciu do x = 0 wypada na −0.0x), a jej krok `optimize` gubi
 * zamknięcia konturów. Ścieżkę i tak potem optymalizuje SVGO.
 */
function toPathData(path) {
  const n = (v) => round(v);
  return path.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case 'Q':
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'C':
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case 'Z':
          return 'Z';
        default:
          throw new Error(`Nieznana komenda ścieżki: ${c.type}`);
      }
    })
    .join('');
}

/** Ścieżka tekstu z początkiem w (x, baseline); oś y w dół, jak w SVG. */
function textPath(text, x, baseline = 0) {
  const path = font.getPath(text, x, baseline, FONT_SIZE, { kerning: true });
  return { path, box: path.getBoundingBox() };
}

function buildWordmark(product) {
  const oIndex = product.suffix.indexOf('O');
  if (oIndex < 0) throw new Error(`Końcówka "${product.suffix}" musi zawierać literę O (sekcja 1).`);
  const before = `Line${product.suffix.slice(0, oIndex)}`;
  const after = product.suffix.slice(oIndex + 1);

  const left = textPath(before, 0);
  const gap = (LAMP_SIDE_GAP + OPTICAL_GAP_CORRECTION) * H;
  const cx = left.box.x2 + gap + BEZEL_OUTER * H;
  const cy = -0.5 * H; // środek lampki: linia bazowa − 0.5 H

  // Prawa część: najpierw w x = 0, żeby poznać przesunięcie tuszu od origin.
  const probe = textPath(after, 0);
  const rightX = cx + BEZEL_OUTER * H + gap - probe.box.x1;
  const right = after ? textPath(after, rightX) : null;

  // viewBox przycięty do tuszu (sekcja 6) — bez pola ochronnego.
  const minX = Math.min(left.box.x1, cx - BEZEL_OUTER * H);
  const maxX = Math.max(right ? right.box.x2 : -Infinity, cx + BEZEL_OUTER * H);
  const minY = Math.min(left.box.y1, right ? right.box.y1 : Infinity, cy - BEZEL_OUTER * H);
  const maxY = Math.max(left.box.y2, right ? right.box.y2 : -Infinity, cy + BEZEL_OUTER * H);

  // Przesunięcie do (0, 0): ścieżki generowane od nowa w docelowym miejscu
  // (linia bazowa y = dy), zamiast przesuwać komendy gotowej ścieżki —
  // obiekty komend opentype.js mają niezdefiniowane pola, które dawały NaN.
  const dx = -minX;
  const dy = -minY;
  const glyphs = [textPath(before, dx, dy), right && textPath(after, rightX + dx, dy)]
    .filter(Boolean)
    .map(({ path }) => toPathData(path))
    .join('');
  if (glyphs.includes('NaN')) throw new Error(`${product.id}: NaN w danych ścieżek glifów`);

  const geometry = {
    width: round(maxX - minX),
    height: round(maxY - minY),
    glyphs,
    cx: round(cx + dx),
    cy: round(cy + dy),
    bezelRadius: round(BEZEL_RADIUS * H),
    bezelStroke: round(BEZEL_STROKE * H),
    lensRadius: round(LENS_RADIUS * H),
    capHeight: H,
    baseline: round(dy),
  };
  verifyGeometry(product, geometry, left.box.x2 + dx, right ? right.box.x1 + dx : null);
  return geometry;
}

/** Kryterium odbioru: geometria lampki zgodna ze spec. z tolerancją ±1%. */
function verifyGeometry(product, g, leftInkRight, rightInkLeft) {
  const checks = [
    ['promień obudowy', g.bezelRadius, BEZEL_RADIUS * H],
    ['grubość obudowy', g.bezelStroke, BEZEL_STROKE * H],
    ['promień soczewki', g.lensRadius, LENS_RADIUS * H],
    ['środek lampki nad linią bazową', g.baseline - g.cy, 0.5 * H],
    ['odstęp z lewej', g.cx - BEZEL_OUTER * H - leftInkRight, (LAMP_SIDE_GAP + OPTICAL_GAP_CORRECTION) * H],
  ];
  if (rightInkLeft !== null) {
    checks.push(['odstęp z prawej', rightInkLeft - (g.cx + BEZEL_OUTER * H), (LAMP_SIDE_GAP + OPTICAL_GAP_CORRECTION) * H]);
  }
  for (const [name, actual, expected] of checks) {
    if (Math.abs(actual - expected) > Math.abs(expected) * 0.01) {
      throw new Error(`${product.id}: ${name} = ${actual}, oczekiwano ${expected} (±1%)`);
    }
  }
}

function wordmarkSvg(product, g) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ln-logo" data-product="${product.id}" data-state="brand" viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="Line${product.suffix}">
  <g class="ln-glyphs" fill="${INK}"><path d="${g.glyphs}"/></g>
  <circle class="ln-bezel" cx="${g.cx}" cy="${g.cy}" r="${g.bezelRadius}" fill="none" stroke="${BEZEL}" stroke-width="${g.bezelStroke}"/>
  <circle class="ln-lens" cx="${g.cx}" cy="${g.cy}" r="${g.lensRadius}" fill="${product.brandLamp}"/>
</svg>
`;
}

// Wariant favicon (sekcja 3): uproszczony, grubsza obudowa — czytelny przy 16 px.
function faviconSvg(product) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="13.5" fill="none" stroke="${BEZEL}" stroke-width="3"/>
  <circle cx="16" cy="16" r="9.5" fill="${product.brandLamp}"/>
</svg>
`;
}

// SVGO z zachowaniem klas i atrybutów data-* (sekcja 7).
function optimizeSvg(svg) {
  return optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        // `keepRoleAttr` zamiast wyłączania całego pluginu: domyślne wartości
        // dalej są usuwane, a `role="img"` (wymagany do `aria-label`) zostaje.
        // Klasy i `data-*` preset-default zachowuje.
        params: { overrides: { removeUnknownsAndDefaults: { keepRoleAttr: true } } },
      },
    ],
  }).data;
}

function moduleSource(product, g, glyphs) {
  return `// WYGENEROWANE przez scripts/build-logo.mjs — nie edytuj ręcznie.
// Barlow SemiBold → ścieżki; H (wysokość wersalików) = ${g.capHeight} jednostek.
export const ${product.id.toUpperCase()}_LOGO = {
  name: 'Line${product.suffix}',
  viewBox: '0 0 ${g.width} ${g.height}',
  glyphs: '${glyphs}',
  lamp: { cx: ${g.cx}, cy: ${g.cy}, bezelRadius: ${g.bezelRadius}, bezelStroke: ${g.bezelStroke}, lensRadius: ${g.lensRadius} },
} as const;
`;
}

function write(relPath, content) {
  const abs = resolve(ROOT, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  console.log(`${relPath} (${Buffer.byteLength(content)} B)`);
}

const SVG_SIZE_LIMIT = 5 * 1024;
for (const product of PRODUCTS) {
  const geometry = buildWordmark(product);
  const svg = optimizeSvg(wordmarkSvg(product, geometry));
  // SVGO przerywa parsowanie ścieżki na pierwszym błędzie i po cichu ucina
  // resztę — liczba konturów (komend move-to) musi się zgadzać ze źródłem.
  const contours = (d) => (d.match(/[Mm]/g) ?? []).length;
  const svgPath = svg.match(/ d="([^"]+)"/)?.[1] ?? '';
  if (contours(svgPath) !== contours(geometry.glyphs)) {
    throw new Error(`${product.id}.svg: SVGO zgubił kontury (${contours(svgPath)}/${contours(geometry.glyphs)})`);
  }
  if (Buffer.byteLength(svg) > SVG_SIZE_LIMIT) throw new Error(`${product.id}.svg > 5 KB`);
  write(`public/brand/logo/${product.id}.svg`, svg);
  // Komponent dostaje tę samą, zoptymalizowaną przez SVGO ścieżkę co plik SVG.
  write(`src/components/brand/${product.id}-logo.generated.ts`, moduleSource(product, geometry, svgPath));
  if (product.favicon) write('src/app/icon.svg', optimizeSvg(faviconSvg(product)));
}

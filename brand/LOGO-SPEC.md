# Specyfikacja logo: rodzina Line (LineON, LineFLOW)

> Źródło: specyfikacja przekazana przez użytkownika 2026-10-19. Komentarze w
> kodzie odwołują się do jej sekcji (np. „sekcja 3”, „§5”).
>
> **Zakres wdrożenia w tej aplikacji (decyzja użytkownika):** tylko LineFLOW —
> wordmark (`public/brand/logo/lineflow.svg`), favicon (`src/app/icon.svg`) i
> komponent `src/components/brand/Logo.tsx` w nagłówku ekranu `/`. Lampka NIE
> pokazuje stanu systemu: świeci kolorem marki, a co 1–3 min mruga dwa razy na
> czerwono (easter egg). Bez LineON, sloganu, wariantów inverse/mono, PNG
> i reguł ciemnego motywu (aplikacja ma zawsze białe tło).
>
> **Świadomy wyjątek od §11** („nie używaj czerwonej soczewki dla LineFLOW poza
> stanem `alarm`”): czerwone mrugnięcie easter egga to wyraźna, późniejsza
> decyzja użytkownika.
> Generowanie: `npm run build:logo` (`scripts/build-logo.mjs`).

Dokument dla agenta kodującego. Realizuj dokładnie wg poniższych wartości. Gdzie decyzja jest optyczna, jest to zaznaczone.

## 1. Koncepcja (żeby rozumieć, co budujesz)

- Rodzina znaków: wspólny człon `Line` + końcówka wersalikami. Produkty: **LineON** (MES), **LineFLOW** (monitoring mediów).
- Pierwsza litera „O” w końcówce jest zastąpiona **lampką sygnalizacyjną**: szary pierścień (obudowa) + kolorowe koło (soczewka).
- Logo działa jak wskaźnik: w kontekstach statusowych kolor soczewki odzwierciedla bieżący stan systemu.
- Zasada dla przyszłych produktów: końcówka musi zawierać literę O. Lampka zawsze zastępuje pierwsze O.

## 2. Typografia

- Krój: **Barlow SemiBold (600)**, licencja SIL OFL, źródło Google Fonts / github.com/jpt/barlow.
- Zapis: `Line` (wielka L, reszta małe) + końcówka WERSALIKAMI, bez spacji: `Line` + `FL` + [lampka] + `W`.
- Tracking: 0 (domyślny). Kerning: domyślny z fontu.
- Kolor tekstu: cały wordmark jednym kolorem `--logo-ink`. Nie kolorujemy „Line” ani końcówki.
- **W plikach finalnych tekst musi być zamieniony na ścieżki (outline).** Logo nie może zależeć od ładowania fontu.

## 3. Geometria lampki

Jednostka bazowa: **H = wysokość wersalików** (cap height) Barlow SemiBold w danym rozmiarze.
Odczytaj ją z fontu: `os2.sCapHeight / unitsPerEm × fontSize`. Nie zgaduj.

| Element | Wartość |
|---|---|
| Promień obudowy (oś obrysu) | 0.52 H |
| Grubość obrysu obudowy | 0.08 H (krawędź zewn. = 0.56 H, średnica zewn. = 1.12 H) |
| Promień soczewki | 0.38 H |
| Szczelina obudowa–soczewka | 0.10 H (wynika z powyższych) |
| Środek lampki (pion) | linia bazowa − 0.5 H |
| Odstęp poziomy od sąsiednich liter | 0.12 H od skrajnego punktu tuszu litery do zewnętrznej krawędzi obudowy, z obu stron |

Lampka celowo wystaje 0.06 H ponad wersaliki i 0.06 H pod linię bazową. To kompensacja optyczna, jak overshoot litery O. Nie wyrównuj jej do H.

Odstępy poziome mierz po bounding boxach ścieżek glifów (`path.getBoundingBox()`), nie po advance width. Po złożeniu oceń optycznie i ewentualnie skoryguj o maks. ±0.03 H. Korektę zapisz jako stałą w skrypcie.

### Referencja: sama lampka (ikona), H = 100

```svg
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <circle class="ln-bezel" cx="60" cy="60" r="52" fill="none" stroke-width="8"/>
  <circle class="ln-lens"  cx="60" cy="60" r="38"/>
</svg>
```

### Wariant favicon (16–32 px), uproszczony, grubsza obudowa

```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle class="ln-bezel" cx="16" cy="16" r="13.5" fill="none" stroke-width="3"/>
  <circle class="ln-lens"  cx="16" cy="16" r="9.5"/>
</svg>
```

## 4. Kolory (tokeny)

| Token | Jasne tło | Ciemne tło | Użycie |
|---|---|---|---|
| `--logo-ink` | `#14171C` | `#F2F4F7` | tekst wordmarku |
| `--logo-bezel` | `#8A9099` | `#6B7280` | obudowa lampki |
| `--lamp-lineon` | `#E5322D` | `#E5322D` | soczewka LineON (stan „brand”) |
| `--lamp-lineflow` | `#18B2A3` | `#18B2A3` | soczewka LineFLOW (stan „brand”) |
| `--state-ok` | `#22B35E` | `#22B35E` | wszystko pracuje |
| `--state-warning` | `#F2A516` | `#F2A516` | uwaga |
| `--state-alarm` | `#E5322D` | `#E5322D` | wymagana reakcja |
| `--state-idle` | `#C4C8CE` | `#3A3F47` | zgaszona lampka: brak danych / postój planowy |

Bez gradientów, cieni, poświaty (glow), efektów 3D. Lampka jest płaska.

## 5. Stany (logo dynamiczne)

Atrybut `data-state` na elemencie logo: `brand` (domyślny) | `ok` | `warning` | `alarm` | `idle`.

- `brand`: kolor produktu, statycznie. **Jedyny dozwolony stan na stronach marketingowych, w materiałach, dokumentach.**
- `ok`: zielony, statycznie.
- `warning`: żółty, pulsowanie co 2 s.
- `alarm`: czerwony, pulsowanie co 1 s.
- `idle`: szara soczewka, statycznie.
- Pulsuje wyłącznie soczewka (opacity 1 → 0.35 → 1). Obudowa i tekst nigdy się nie animują.
- `prefers-reduced-motion: reduce` → brak animacji.
- Przy zmianie stanu aktualizuj `aria-label`, np. `"LineON – stan: alarm"`.

```css
.ln-logo { --ink: #14171C; --bezel: #8A9099; --lens: var(--brand-lamp); }
.ln-logo[data-product="lineon"]   { --brand-lamp: #E5322D; }
.ln-logo[data-product="lineflow"] { --brand-lamp: #18B2A3; }
.ln-logo[data-state="ok"]      { --lens: #22B35E; }
.ln-logo[data-state="warning"] { --lens: #F2A516; }
.ln-logo[data-state="alarm"]   { --lens: #E5322D; }
.ln-logo[data-state="idle"]    { --lens: #C4C8CE; }

.ln-logo .ln-glyphs { fill: var(--ink); }
.ln-logo .ln-bezel  { fill: none; stroke: var(--bezel); }
.ln-logo .ln-lens   { fill: var(--lens); }

@keyframes ln-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
.ln-logo[data-state="warning"] .ln-lens { animation: ln-pulse 2s ease-in-out infinite; }
.ln-logo[data-state="alarm"]   .ln-lens { animation: ln-pulse 1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .ln-logo .ln-lens { animation: none; } }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .ln-logo { --ink: #F2F4F7; --bezel: #6B7280; }
  :root:not([data-theme="light"]) .ln-logo[data-state="idle"] { --lens: #3A3F47; }
}
:root[data-theme="dark"] .ln-logo { --ink: #F2F4F7; --bezel: #6B7280; }
:root[data-theme="dark"] .ln-logo[data-state="idle"] { --lens: #3A3F47; }
```

### Dynamiczny favicon (tylko w aplikacji, nie na stronie marketingowej)

- Generuj SVG faviconu (sekcja 3) z kolorem soczewki wg stanu i podmieniaj `href` w `<link rel="icon">` jako data URI.
- Fallback statyczny w kolorze brand: PNG 32×32 i `apple-touch-icon` 180×180.

## 6. Struktura SVG wordmarku

Jeden plik SVG na wariant. Klasy jak niżej, bo CSS z sekcji 5 musi działać na inline SVG:

```svg
<svg class="ln-logo" data-product="lineon" data-state="brand"
     viewBox="…" role="img" aria-label="LineON">
  <g class="ln-glyphs"><path d="…"/></g>   <!-- "Line" + "N", ścieżki -->
  <circle class="ln-bezel" …/>
  <circle class="ln-lens"  …/>
</svg>
```

- viewBox przycięty do zewnętrznych krawędzi tuszu (bez pola ochronnego w pliku).
- Pole ochronne dokładaj w layoucie: min. 0.5 H z każdej strony.
- Do osadzania z możliwością zmiany stanu używaj inline SVG lub komponentu. `<img>` blokuje sterowanie CSS.

## 7. Generowanie (skrypt build)

Zrób skrypt `scripts/build-logo.mjs` (Node + `opentype.js`), który:

1. Ładuje `Barlow-SemiBold.ttf` (TTF/OTF, nie woff2).
2. Liczy H z `os2.sCapHeight`.
3. Generuje ścieżki: `Line`, część końcówki przed O, część po O.
4. Wylicza bounding boxy i rozmieszcza lampkę wg sekcji 3.
5. Zapisuje wszystkie warianty z sekcji 8.
6. Ma tablicę produktów, np. `{ id: "lineon", suffix: "ON", brandLamp: "#E5322D" }`, żeby dodanie kolejnego produktu było jedną linijką.

Wynikowe SVG zoptymalizuj SVGO z zachowaniem klas i atrybutów `data-*` (wyłącz `removeUnknownsAndDefaults` dla `data-*`, `cleanupIds` ok). Cel: < 5 KB na plik.

## 8. Warianty do dostarczenia

Ścieżka: `/brand/logo/`

- `{product}.svg`: wordmark, kolorowy, jasne tło
- `{product}-inverse.svg`: wordmark na ciemne tło
- `{product}-mono.svg`: jeden kolor (`currentColor`) dla tekstu, obudowy i soczewki, do druku jednobarwnego i grawerów
- `{product}-tagline.svg`: wordmark + slogan (sekcja 9)
- `{product}-icon.svg`: sama lampka (ikona aplikacji, avatar)
- `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` (180×180)
- Komponent w stosie projektu (np. `Logo.tsx` / `logo.js`) z propsami: `product`, `state`, `variant` (`full` | `icon` | `tagline`), `height`, `title`

## 9. Slogany (lockup z taglinem)

| Produkt | Slogan |
|---|---|
| LineON | Walk to the red |
| LineFLOW | Follow the flow |

- Krój: Barlow Medium (500). Wysokość wersalików sloganu = 0.30 H. Kolor: `--logo-ink` z opacity 0.7 (albo `#5B616B` / `#A3A9B2` na ciemnym).
- Wyrównanie do lewej krawędzi tuszu litery „L”.
- Odstęp: od linii bazowej wordmarku do górnej krawędzi wersalików sloganu = 0.45 H.
- Slogan też jako ścieżki.

## 10. Rozmiary minimalne

- Wordmark: min. 20 px wysokości (ekran) / 8 mm (druk). Poniżej używaj ikony.
- Wordmark z taglinem: min. 36 px / 14 mm.
- Ikona: min. 16 px; przy 16–32 px używaj wariantu favicon (grubsza obudowa).

## 11. Zakazy

- Nie zamieniaj lampki na płaską kropkę bez obudowy.
- Nie dodawaj glow, gradientów, cieni ani odblasku na soczewce.
- Nie koloruj tekstu wordmarku.
- Nie rozciągaj, nie pochylaj, nie zmieniaj proporcji lampki względem H.
- Nie animuj logo na stronach marketingowych (tylko stan `brand`).
- Nie używaj czerwonej soczewki dla LineFLOW poza stanem `alarm`.
- Nie pisz końcówki małymi literami (`Lineon` ✗, `LINEON` ✗, `LineON` ✓).

## 12. Kryteria odbioru

- [ ] Tekst w plikach finalnych jest ścieżkami. Brak `<text>` i zależności od fontu.
- [ ] Geometria lampki zgodna z sekcją 3 (sprawdź liczbowo w skrypcie, tolerancja ±1%).
- [ ] Ostro i czytelnie przy 20, 48 i 200 px wysokości. Favicon czytelny przy 16 px.
- [ ] Jasny i ciemny motyw działają (`prefers-color-scheme` + `data-theme`).
- [ ] Wszystkie 5 stanów przełączają się atrybutem `data-state` bez przeładowania. `aria-label` się aktualizuje.
- [ ] `prefers-reduced-motion` wyłącza pulsowanie.
- [ ] Wariant mono działa w jednym kolorze przez `currentColor`.
- [ ] Każdy plik SVG < 5 KB po SVGO.
- [ ] Dodanie nowego produktu = jeden wpis w tablicy produktów w skrypcie.

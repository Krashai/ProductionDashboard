import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewMetricTile } from '@/components/OverviewMetricTile';

// Patrz komentarz w MetricCard.test.tsx: `Counter` animuje przez rAF, które
// nigdy nie odpala synchronicznie w jsdom — bez mocka asercje widziałyby
// tylko stan startowy "0" niezależnie od przekazanej wartości.
vi.mock('@/components/Counter', () => ({
  Counter: ({ value, decimals = 1 }: { value: number; decimals?: number }) => (
    <>{value.toFixed(decimals)}</>
  ),
}));

describe('OverviewMetricTile', () => {
  test('renderuje wartość, jednostkę i etykietę', () => {
    render(<OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} />);
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('°C')).toBeInTheDocument();
    expect(screen.getByText('Temperatura')).toBeInTheDocument();
  });

  test('renderuje wartość liczbową w font-mono (typografia liczników, decyzja użytkownika)', () => {
    render(<OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} />);
    expect(screen.getByText('17').className).toMatch(/font-mono/);
  });

  // Regresja (sierpień 2026, weryfikacja wizualna ekranu Energii): jednostka
  // miała klasę `lowercase`, więc kW/kVA/kVAr/V/A/°C renderowały się jako
  // "kw"/"kva"/"kvar"/"v"/"a"/"°c" — jednostki SI są wrażliwe na wielkość
  // liter, to błąd rzeczowy, nie kosmetyka. Asercja MUSI iść po klasie, nie
  // po treści: `text-transform` jest czysto wizualny, `getByText('kVA')`
  // przechodzi także wtedy, gdy użytkownik widzi na ekranie "kva".
  test.each(['kW', 'kVA', 'kVAr', 'V', 'A', '°C'])(
    'jednostka "%s" nie jest przekształcana przez text-transform (zapis SI)',
    (unit) => {
      render(<OverviewMetricTile label="Metryka" value={17} unit={unit} decimals={0} />);
      const unitEl = screen.getByText(unit);
      expect(unitEl.className).not.toMatch(/lowercase|uppercase|capitalize/);
    }
  );

  test('wartość ujemna jest przycinana do 0 na potrzeby wyświetlania (szum PLC)', () => {
    render(<OverviewMetricTile label="Ciśnienie" value={-0.05} unit="bar" decimals={2} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.queryByText('-0.05')).not.toBeInTheDocument();
  });

  test('domyślny stan (brak alarmu/offline) ma białą kartę z niewidocznym paskiem akcentu', () => {
    const { container } = render(<OverviewMetricTile label="X" value={1} decimals={0} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/bg-white/);
    expect(root.className).toMatch(/border-slate-200/);
    const accentBar = root.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(accentBar.className).toMatch(/bg-transparent/);
    expect(accentBar.className).not.toMatch(/bg-rose/);
  });

  test('alarm=true miga na różowo z rose accent barem i poświatą (decyzja #16, ujednolicenie kolorystyki)', () => {
    const { container } = render(<OverviewMetricTile label="X" value={1} decimals={0} alarm />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/border-rose-200/);
    expect(root).toHaveClass('animate-alarm-flash');
    expect(root.className).toMatch(/shadow-\[2px_0_20px_rgba\(225,29,72,0\.3\)\]/);
    const accentBar = root.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(accentBar.className).toMatch(/bg-rose-500/);
  });

  test('kolor paska akcentu jest zawsze taki sam bez względu na jednostkę metryki (ujednolicenie kolorystyki)', () => {
    const { container: tempContainer } = render(
      <OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} />
    );
    const tempAccent = tempContainer.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(tempAccent.className).toMatch(/bg-transparent/);

    const { container: pressureContainer } = render(
      <OverviewMetricTile label="Ciśnienie" value={6} unit="bar" decimals={0} />
    );
    const pressureAccent = pressureContainer.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(pressureAccent.className).toMatch(/bg-transparent/);
  });

  test('offline=true pokazuje placeholder "—" i wygasza kafel', () => {
    const { container } = render(<OverviewMetricTile label="X" value={42} decimals={0} offline />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/grayscale-\[0\.5\]/);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });

  test('bez podanej jednostki nie renderuje pustego elementu jednostki', () => {
    render(<OverviewMetricTile label="X" value={1} decimals={0} />);
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  test('przyjmuje testId jako data-testid na korzeniu', () => {
    const { container } = render(
      <OverviewMetricTile label="X" value={1} decimals={0} testId="tile-1" />
    );
    expect(container.querySelector('[data-testid="tile-1"]')).toBeInTheDocument();
  });

  test('nie renderuje sparkline/svg (overview jest bez trendu, decyzja #22)', () => {
    const { container } = render(<OverviewMetricTile label="X" value={1} decimals={0} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  test('size domyślne (brak propa) renderuje tekst wartości w text-4xl', () => {
    render(<OverviewMetricTile label="X" value={17} decimals={0} />);
    expect(screen.getByText('17').className).toMatch(/text-4xl/);
  });

  test('size="lg" (ekran szczegółowy Chłodni 1/2/3) renderuje większy tekst wartości', () => {
    render(<OverviewMetricTile label="X" value={17} decimals={0} size="lg" />);
    const valueEl = screen.getByText('17');
    expect(valueEl.className).toMatch(/text-6xl/);
    expect(valueEl.className).not.toMatch(/text-4xl/);
  });

  test('size="sm" (siatka 12 kafli trafostacji) renderuje mniejszy tekst wartości niż default', () => {
    render(<OverviewMetricTile label="X" value={17} decimals={0} size="sm" />);
    const valueEl = screen.getByText('17');
    // Asercje kotwiczone na granicy klasy — `2xl:text-4xl` zawiera podciąg
    // "text-4xl", więc gołe /text-4xl/ dałoby fałszywy alarm.
    expect(valueEl.className).toMatch(/(^|\s)text-lg(\s|$)/);
    expect(valueEl.className).not.toMatch(/(^|\s)text-4xl(\s|$)/);
    expect(valueEl.className).not.toMatch(/(^|\s)text-6xl(\s|$)/);
  });

  test('size="sm" zmniejsza też jednostkę i etykietę', () => {
    render(<OverviewMetricTile label="Czynna" value={17} unit="kW" decimals={0} size="sm" />);
    expect(screen.getByText('kW').className).toMatch(/text-\[10px\]/);
    // Etykieta `sm` podniesiona o stopień (`text-[9px]`→`text-[10px]`) po
    // skróceniu etykiet na ekranie Energii — była najmniejszym tekstem w
    // całej aplikacji, a odzyskana szerokość pozwoliła ją powiększyć bez
    // ruszania wysokości kafla.
    expect(screen.getByText('Czynna').className).toMatch(/text-\[10px\]/);
    expect(screen.getByText('Czynna').className).not.toMatch(/text-\[9px\]/);
  });

  test('size="sm" ma ciaśniejszy padding i mniejszy promień niż default (12 kafli w kolumnie)', () => {
    const { container: smContainer } = render(
      <OverviewMetricTile label="X" value={1} decimals={0} size="sm" />
    );
    const smRoot = smContainer.firstElementChild as HTMLElement;
    expect(smRoot.className).toMatch(/(^|\s)rounded-xl(\s|$)/);
    expect(smRoot.className).not.toMatch(/(^|\s)rounded-2xl(\s|$)/);
    expect((smRoot.lastElementChild as HTMLElement).className).toMatch(/(^|\s)py-2(\s|$)/);

    const { container: defaultContainer } = render(
      <OverviewMetricTile label="X" value={1} decimals={0} />
    );
    const defaultRoot = defaultContainer.firstElementChild as HTMLElement;
    expect(defaultRoot.className).toMatch(/(^|\s)rounded-2xl(\s|$)/);
    expect((defaultRoot.lastElementChild as HTMLElement).className).toMatch(/(^|\s)py-3(\s|$)/);
  });

  test('size="sm" zachowuje reguły alarmu/offline wspólne dla wszystkich rozmiarów', () => {
    const { container } = render(
      <OverviewMetricTile label="X" value={42} decimals={0} size="sm" alarm offline />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('animate-alarm-flash');
    expect(root.className).toMatch(/motion-reduce:animate-none/);
    expect(root.className).toMatch(/grayscale-\[0\.5\]/);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // Slot `children` (martwe pole między wartością a etykietą) dodany dla
  // paska asymetrii faz na ekranie Energii. Kluczowa gwarancja: kafle bez
  // `children` — czyli ekran główny, Chłodnia i Sprężarkownia — mają
  // renderować się dokładnie tak jak przed jego dodaniem.
  describe('slot children (środek kafla)', () => {
    test('bez children kafel ma dokładnie dwa elementy wewnętrzne: wartość i etykietę', () => {
      const { container } = render(
        <OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} />
      );
      const inner = (container.firstElementChild as HTMLElement).lastElementChild as HTMLElement;
      expect(inner.children).toHaveLength(2);
      expect(inner.lastElementChild?.textContent).toBe('Temperatura');
    });

    test('renderowanie bez children jest identyczne jak przed dodaniem slotu (ten sam HTML)', () => {
      const { container: withoutProp } = render(
        <OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} size="sm" />
      );
      const { container: withUndefined } = render(
        <OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} size="sm">
          {undefined}
        </OverviewMetricTile>
      );
      expect(withUndefined.innerHTML).toBe(withoutProp.innerHTML);
    });

    test('children ląduje MIĘDZY wartością a etykietą, nie na końcu kafla', () => {
      const { container } = render(
        <OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0}>
          <div data-testid="slot" />
        </OverviewMetricTile>
      );
      const inner = (container.firstElementChild as HTMLElement).lastElementChild as HTMLElement;
      expect(inner.children).toHaveLength(3);
      expect(inner.children[1].getAttribute('data-testid')).toBe('slot');
      expect(inner.lastElementChild?.textContent).toBe('Temperatura');
    });

    test('children nie zmienia wartości ani etykiety kafla', () => {
      render(
        <OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0}>
          <div data-testid="slot" />
        </OverviewMetricTile>
      );
      expect(screen.getByText('17')).toBeInTheDocument();
      expect(screen.getByText('°C')).toBeInTheDocument();
      expect(screen.getByText('Temperatura')).toBeInTheDocument();
    });
  });
  // Kafel na Sprężarkowni dostaje ~40% wysokości kiosku, czyli znacznie
  // więcej niż potrzebuje jego treść — `between` rozjeżdżało wtedy liczbę i
  // podpis o kilkaset px i przestawały czytać się jako jeden obiekt.
  describe('align (pionowe rozłożenie treści)', () => {
    test('domyślnie (brak propa) treść jest rozpychana: wartość u góry, etykieta u dołu', () => {
      const { container } = render(<OverviewMetricTile label="X" value={1} decimals={0} />);
      const inner = (container.firstElementChild as HTMLElement).lastElementChild as HTMLElement;
      expect(inner.className).toMatch(/(^|\s)justify-between(\s|$)/);
      expect(inner.className).not.toMatch(/(^|\s)justify-center(\s|$)/);
    });

    test('align="center" skleja wartość i etykietę w jedną wyśrodkowaną grupę', () => {
      const { container } = render(<OverviewMetricTile label="X" value={1} decimals={0} align="center" />);
      const inner = (container.firstElementChild as HTMLElement).lastElementChild as HTMLElement;
      expect(inner.className).toMatch(/(^|\s)justify-center(\s|$)/);
      expect(inner.className).not.toMatch(/(^|\s)justify-between(\s|$)/);
    });

    test('align nie zmienia niczego poza rozłożeniem (rozmiar, alarm, offline bez zmian)', () => {
      const { container } = render(
        <OverviewMetricTile label="X" value={1} decimals={0} size="lg" align="center" alarm />
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toMatch(/animate-alarm-flash/);
      expect(screen.getByText('1').className).toMatch(/text-6xl/);
    });
  });
});

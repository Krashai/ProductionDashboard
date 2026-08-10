import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from '@/components/MetricCard';

// `Counter` animuje przez requestAnimationFrame (count-up 1.5s od 0) — w
// jsdom rAF nigdy nie odpala synchronicznie w trakcie testu, więc bez mocka
// każda asercja widziałaby tylko stan startowy "0", niezależnie od
// przekazanej wartości (co ukryłoby np. brak przycinania ujemnego szumu
// PLC). Mock renderuje finalną wartość od razu, bez animacji.
vi.mock('@/components/Counter', () => ({
  Counter: ({ value, decimals = 1 }: { value: number; decimals?: number }) => (
    <>{value.toFixed(decimals)}</>
  ),
}));

describe('MetricCard', () => {
  test('renderuje etykietę i jednostkę', () => {
    render(<MetricCard label="Temperatura wody na halę" value={5.2} unit="°C" decimals={1} />);
    expect(screen.getByText('Temperatura wody na halę')).toBeInTheDocument();
    expect(screen.getByText('°C')).toBeInTheDocument();
  });

  test('renderuje wartość liczbową z poprawną precyzją, gdy online', () => {
    render(<MetricCard label="X" value={7} unit="bar" decimals={2} />);
    expect(screen.getByText(/^\d+\.\d{2}$/)).toBeInTheDocument();
  });

  test('renderuje wartość liczbową w font-mono (typografia liczników, decyzja użytkownika)', () => {
    render(<MetricCard label="X" value={7} unit="bar" decimals={2} />);
    const value = screen.getByText(/^\d+\.\d{2}$/);
    expect(value.className).toMatch(/font-mono/);
  });

  test('wartość ujemna jest przycinana do 0 tylko na potrzeby wyświetlania (decyzja użytkownika: szum PLC)', () => {
    render(<MetricCard label="X" value={-0.05} unit="bar" decimals={2} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
  });

  test('alarm=true dodaje animate-alarm-flash i akcent rose', () => {
    const { container } = render(<MetricCard label="X" value={1} alarm decimals={0} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('animate-alarm-flash');
    expect(root.className).toMatch(/border-rose/);
  });

  test('alarm=false nie dodaje migania ani akcentu rose', () => {
    const { container } = render(<MetricCard label="X" value={1} decimals={0} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveClass('animate-alarm-flash');
    expect(root.className).not.toMatch(/border-rose/);
  });

  test('offline=true dodaje grayscale/opacity i pokazuje placeholder "—" zamiast wartości', () => {
    const { container } = render(<MetricCard label="X" value={99} offline decimals={0} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/grayscale-\[0\.5\]/);
    expect(root.className).toMatch(/opacity-75/);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  test('offline=false renderuje realną wartość liczbową, nie placeholder', () => {
    render(<MetricCard label="X" value={12} decimals={0} />);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  test('przekazana historia renderuje Sparkline (svg) w stopce karty', () => {
    const { container } = render(<MetricCard label="X" value={1} decimals={0} history={[1, 2, 3, 4]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('polyline')).toBeInTheDocument();
  });

  test('brak historii nie crashuje i nie renderuje polyline', () => {
    const { container } = render(<MetricCard label="X" value={1} decimals={0} />);
    expect(container.querySelector('polyline')).not.toBeInTheDocument();
  });

  test('przyjmuje testId przekazywany jako data-testid na korzeniu', () => {
    const { container } = render(
      <MetricCard label="X" value={1} decimals={0} testId="metric-card-temp" />
    );
    expect(container.querySelector('[data-testid="metric-card-temp"]')).toBeInTheDocument();
  });

  describe('compact (overview, Concept.md §6a)', () => {
    test('compact=true renderuje mniejsze zaokrąglenie i padding niż wariant pełny', () => {
      const { container } = render(<MetricCard label="X" value={1} decimals={0} compact />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).not.toMatch(/rounded-\[2\.5rem\]/);
      expect(root.className).not.toMatch(/p-6/);
    });

    test('compact=true gasi Sparkline nawet gdy przekazana jest historia (decyzja #22)', () => {
      const { container } = render(
        <MetricCard label="X" value={1} decimals={0} history={[1, 2, 3, 4]} compact />
      );
      expect(container.querySelector('svg')).not.toBeInTheDocument();
      expect(container.querySelector('polyline')).not.toBeInTheDocument();
    });

    test('compact=false (domyślnie) nadal renderuje Sparkline, gdy jest historia', () => {
      const { container } = render(
        <MetricCard label="X" value={1} decimals={0} history={[1, 2, 3, 4]} />
      );
      expect(container.querySelector('polyline')).toBeInTheDocument();
    });

    test('compact + alarm=true nadal miga i akcentuje rose (zachowanie alarmu bez zmian)', () => {
      const { container } = render(<MetricCard label="X" value={1} decimals={0} alarm compact />);
      const root = container.firstElementChild as HTMLElement;
      expect(root).toHaveClass('animate-alarm-flash');
      expect(root.className).toMatch(/border-rose/);
    });

    test('compact + offline=true nadal gasi kartę i pokazuje placeholder "—" (zachowanie offline bez zmian)', () => {
      const { container } = render(<MetricCard label="X" value={99} decimals={0} offline compact />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toMatch(/grayscale-\[0\.5\]/);
      expect(root.className).toMatch(/opacity-75/);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    test('compact nadal renderuje etykietę, wartość i jednostkę', () => {
      render(<MetricCard label="Ciśnienie" value={7} unit="bar" decimals={2} compact />);
      expect(screen.getByText('Ciśnienie')).toBeInTheDocument();
      expect(screen.getByText('bar')).toBeInTheDocument();
      expect(screen.getByText(/^\d+\.\d{2}$/)).toBeInTheDocument();
    });

    test('compact renderuje wartość liczbową w font-mono', () => {
      render(<MetricCard label="Ciśnienie" value={7} unit="bar" decimals={2} compact />);
      const value = screen.getByText(/^\d+\.\d{2}$/);
      expect(value.className).toMatch(/font-mono/);
    });
  });

  describe('wskaźnik trendu (dwa ostatnie punkty historii)', () => {
    test('rosnący ostatni odcinek renderuje strzałkę w górę', () => {
      const { container } = render(<MetricCard label="X" value={5} decimals={1} history={[1, 2]} />);
      const trend = container.querySelector('[data-testid="metric-trend"]');
      expect(trend).toBeInTheDocument();
      expect(trend).toHaveAttribute('data-direction', 'up');
    });

    test('malejący ostatni odcinek renderuje strzałkę w dół', () => {
      const { container } = render(<MetricCard label="X" value={5} decimals={1} history={[2, 1]} />);
      const trend = container.querySelector('[data-testid="metric-trend"]');
      expect(trend).toBeInTheDocument();
      expect(trend).toHaveAttribute('data-direction', 'down');
    });

    test('równe dwa ostatnie punkty renderują płaski wskaźnik (Minus)', () => {
      const { container } = render(<MetricCard label="X" value={5} decimals={1} history={[3, 3]} />);
      const trend = container.querySelector('[data-testid="metric-trend"]');
      expect(trend).toBeInTheDocument();
      expect(trend).toHaveAttribute('data-direction', 'flat');
    });

    test('historia krótsza niż 2 punkty nie renderuje wskaźnika trendu', () => {
      const { container } = render(<MetricCard label="X" value={5} decimals={1} history={[3]} />);
      expect(container.querySelector('[data-testid="metric-trend"]')).not.toBeInTheDocument();
    });

    test('brak historii nie renderuje wskaźnika trendu', () => {
      const { container } = render(<MetricCard label="X" value={5} decimals={1} />);
      expect(container.querySelector('[data-testid="metric-trend"]')).not.toBeInTheDocument();
    });

    test('wskaźnik trendu jest kolorystycznie neutralny (slate), nawet w stanie alarmu', () => {
      const { container } = render(
        <MetricCard label="X" value={5} decimals={1} alarm history={[1, 2]} />
      );
      const trend = container.querySelector('[data-testid="metric-trend"]');
      expect(trend?.getAttribute('class')).toMatch(/text-slate-400/);
      expect(trend?.getAttribute('class')).not.toMatch(/text-rose/);
    });

    test('compact=true nie renderuje wskaźnika trendu (zachowanie compact bez zmian)', () => {
      const { container } = render(
        <MetricCard label="X" value={5} decimals={1} history={[1, 2]} compact />
      );
      expect(container.querySelector('[data-testid="metric-trend"]')).not.toBeInTheDocument();
    });
  });
});

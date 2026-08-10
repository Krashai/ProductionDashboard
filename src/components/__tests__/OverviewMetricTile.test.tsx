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
});

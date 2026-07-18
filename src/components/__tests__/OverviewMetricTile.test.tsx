import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewMetricTile } from '@/components/OverviewMetricTile';

describe('OverviewMetricTile', () => {
  test('renderuje wartość, jednostkę i etykietę', () => {
    render(<OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} />);
    expect(screen.getByText(/^\d+$/)).toBeInTheDocument();
    expect(screen.getByText('°C')).toBeInTheDocument();
    expect(screen.getByText('Temperatura')).toBeInTheDocument();
  });

  test('domyślny stan (brak alarmu/offline) ma białą kartę z paskiem akcentu', () => {
    const { container } = render(<OverviewMetricTile label="X" value={1} decimals={0} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/bg-white/);
    expect(root.className).toMatch(/border-slate-200/);
  });

  test('alarm=true pulsuje na różowo z rose accent barem i poświatą (decyzja #16)', () => {
    const { container } = render(<OverviewMetricTile label="X" value={1} decimals={0} alarm />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/border-rose-200/);
    expect(root).toHaveClass('animate-pulse-subtle');
    expect(root.className).toMatch(/shadow-\[2px_0_20px_rgba\(225,29,72,0\.3\)\]/);
    const accentBar = root.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(accentBar.className).toMatch(/bg-rose-500/);
  });

  test('kolor paska akcentu zależy od jednostki metryki (metric-color.ts)', () => {
    const { container: tempContainer } = render(
      <OverviewMetricTile label="Temperatura" value={17} unit="°C" decimals={0} />
    );
    const tempAccent = tempContainer.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(tempAccent.className).toMatch(/bg-blue-500/);
    const tempRoot = tempContainer.firstElementChild as HTMLElement;
    expect(tempRoot.className).toMatch(/shadow-\[2px_0_15px_rgba\(59,130,246,0\.3\)\]/);

    const { container: pressureContainer } = render(
      <OverviewMetricTile label="Ciśnienie" value={6} unit="bar" decimals={0} />
    );
    const pressureAccent = pressureContainer.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(pressureAccent.className).toMatch(/bg-emerald-500/);
    const pressureRoot = pressureContainer.firstElementChild as HTMLElement;
    expect(pressureRoot.className).toMatch(/shadow-\[2px_0_15px_rgba\(16,185,129,0\.3\)\]/);
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

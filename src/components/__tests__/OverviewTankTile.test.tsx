import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTankTile } from '@/components/OverviewTankTile';

describe('OverviewTankTile', () => {
  test('renderuje wartość w cm i podpis "Poziom" przy dolnej krawędzi', () => {
    render(<OverviewTankTile valueCm={95} maxCm={110} />);
    expect(screen.getByText('95')).toBeInTheDocument();
    expect(screen.getByText('cm')).toBeInTheDocument();
    expect(screen.getByText('Poziom')).toBeInTheDocument();
  });

  test('wypełnienie to pełnokaflowa warstwa (z-0) pod treścią (z-10), nie osobna podstrefa', () => {
    const { container } = render(
      <OverviewTankTile valueCm={50} maxCm={200} testId="tank-z" />
    );
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-z"]') as HTMLElement;
    expect(fill.className).toMatch(/absolute/);
    expect(fill.className).toMatch(/inset-x-0/);
    expect(fill.className).toMatch(/bottom-0/);
    expect(fill.className).toMatch(/z-0/);
  });

  test('kolejność warstw: pasek akcentu (z-20) nad treścią (z-10) nad wypełnieniem (z-0), niezależnie od wysokości wypełnienia', () => {
    const { container } = render(
      <OverviewTankTile valueCm={198} maxCm={200} testId="tank-stack" />
    );
    const root = container.firstElementChild as HTMLElement;
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-stack"]') as HTMLElement;
    expect(fill.style.height).toBe('99%');

    const accentBar = root.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(accentBar.className).toMatch(/z-20/);

    // Treść (wartość/etykieta) to jedyne dziecko korzenia, które NIE jest
    // `aria-hidden` — musi mieć z-10, żeby zostać nad wypełnieniem nawet
    // przy wysokim procencie wypełnienia (tu: 99%).
    const contentWrapper = Array.from(root.children).find(
      (child) => child.getAttribute('aria-hidden') !== 'true'
    ) as HTMLElement;
    expect(contentWrapper.className).toMatch(/relative/);
    expect(contentWrapper.className).toMatch(/z-10/);
    expect(contentWrapper).toHaveTextContent('198');
  });

  test('domyślny stan ma białą kartę z niebieskim paskiem akcentu (DesignGuideline §5)', () => {
    const { container } = render(<OverviewTankTile valueCm={95} maxCm={110} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/bg-white/);
    expect(root.className).toMatch(/border-slate-200/);
    expect(root.className).toMatch(/shadow-\[2px_0_15px_rgba\(59,130,246,0\.3\)\]/);
    const accentBar = root.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(accentBar.className).toMatch(/bg-blue-500/);
  });

  test('wypełnienie proporcjonalne do valueCm/maxCm', () => {
    const { container } = render(
      <OverviewTankTile valueCm={50} maxCm={200} testId="tank-a" />
    );
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-a"]') as HTMLElement;
    expect(fill.style.height).toBe('25%');
  });

  test('wartość powyżej maxCm przycinana do 100%', () => {
    const { container } = render(
      <OverviewTankTile valueCm={999} maxCm={200} testId="tank-b" />
    );
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-b"]') as HTMLElement;
    expect(fill.style.height).toBe('100%');
  });

  test('wartość ujemna przycinana do 0%', () => {
    const { container } = render(
      <OverviewTankTile valueCm={-10} maxCm={200} testId="tank-c" />
    );
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-c"]') as HTMLElement;
    expect(fill.style.height).toBe('0%');
  });

  test('maxCm<=0 nie crashuje, renderuje 0%', () => {
    const { container } = render(
      <OverviewTankTile valueCm={10} maxCm={0} testId="tank-d" />
    );
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-d"]') as HTMLElement;
    expect(fill.style.height).toBe('0%');
  });

  test('offline=true pokazuje placeholder "—" i wygasza kafel', () => {
    const { container } = render(<OverviewTankTile valueCm={95} maxCm={110} offline />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/grayscale-\[0\.5\]/);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('95')).not.toBeInTheDocument();
  });

  test('alarm=true koloruje wypełnienie na czerwono i pulsuje', () => {
    const { container } = render(
      <OverviewTankTile valueCm={50} maxCm={200} alarm testId="tank-e" />
    );
    const root = container.firstElementChild as HTMLElement;
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-e"]') as HTMLElement;
    expect(root).toHaveClass('animate-pulse-subtle');
    expect(root.className).toMatch(/shadow-\[2px_0_20px_rgba\(225,29,72,0\.3\)\]/);
    expect(fill.className).toMatch(/bg-rose/);
    const accentBar = root.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(accentBar.className).toMatch(/bg-rose-500/);
  });

  test('alarm=false zachowuje domyślne niebieskie wypełnienie', () => {
    const { container } = render(
      <OverviewTankTile valueCm={50} maxCm={200} testId="tank-f" />
    );
    const fill = container.querySelector('[data-testid="overview-tank-fill-tank-f"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-blue/);
  });
});

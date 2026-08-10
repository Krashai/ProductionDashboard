import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TankLevelBar } from '@/components/TankLevelBar';

describe('TankLevelBar', () => {
  test('renderuje wypełnienie proporcjonalne do valueCm/maxCm', () => {
    const { container } = render(<TankLevelBar valueCm={50} maxCm={200} />);
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(fill.style.height).toBe('25%');
  });

  test('wartość 0 daje pusty pasek (0%)', () => {
    const { container } = render(<TankLevelBar valueCm={0} maxCm={200} />);
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(fill.style.height).toBe('0%');
  });

  test('wartość równa maxCm daje pełny pasek (100%)', () => {
    const { container } = render(<TankLevelBar valueCm={200} maxCm={200} />);
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(fill.style.height).toBe('100%');
  });

  test('wartość powyżej maxCm jest przycinana do 100%, bez przepełnienia paska', () => {
    const { container } = render(<TankLevelBar valueCm={999} maxCm={200} />);
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(fill.style.height).toBe('100%');
  });

  test('wartość ujemna jest przycinana do 0%', () => {
    const { container } = render(<TankLevelBar valueCm={-50} maxCm={200} />);
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(fill.style.height).toBe('0%');
  });

  test('renderuje wartość liczbową w cm jako tekst', () => {
    render(<TankLevelBar valueCm={123} maxCm={200} />);
    expect(screen.getByText(/123/)).toBeInTheDocument();
  });

  test('maxCm===0 nie crashuje (dzielenie przez zero dawałoby NaN) i renderuje 0%', () => {
    const { container } = render(<TankLevelBar valueCm={10} maxCm={0} />);
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(fill.style.height).toBe('0%');
  });

  test('offline=true wygasza wizualnie pasek (grayscale/opacity)', () => {
    const { container } = render(<TankLevelBar valueCm={100} maxCm={200} offline />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/grayscale-\[0\.5\]/);
    expect(root.className).toMatch(/opacity-75/);
  });

  // Tank level to też "karta metryki" w sensie decyzji #16 (Concept.md) — jej
  // alarm (np. zbyt niski poziom) musi tak samo migać jak MetricCard.
  test('alarm=true dodaje animate-alarm-flash i czerwone wypełnienie', () => {
    const { container } = render(<TankLevelBar valueCm={100} maxCm={200} alarm />);
    const root = container.firstElementChild as HTMLElement;
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(root).toHaveClass('animate-alarm-flash');
    expect(fill.className).toMatch(/bg-rose/);
  });

  test('alarm=false zachowuje domyślne niebieskie wypełnienie bez migania', () => {
    const { container } = render(<TankLevelBar valueCm={100} maxCm={200} />);
    const root = container.firstElementChild as HTMLElement;
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    expect(root).not.toHaveClass('animate-alarm-flash');
    expect(fill.className).toMatch(/bg-blue/);
  });

  test('wartość ujemna jest przycinana do 0 na potrzeby wyświetlania (szum PLC, wyświetlanie nie wpływa na wypełnienie)', () => {
    render(<TankLevelBar valueCm={-5} maxCm={200} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('-5')).not.toBeInTheDocument();
  });

  test('przyjmuje testId przekazywany jako data-testid na korzeniu', () => {
    const { container } = render(
      <TankLevelBar valueCm={100} maxCm={200} testId="tank-level-chlodnia-1" />
    );
    expect(container.querySelector('[data-testid="tank-level-chlodnia-1"]')).toBeInTheDocument();
  });

  describe('compact (overview, decyzja #23)', () => {
    test('compact=true renderuje mniejszy słupek i mniejszy padding karty niż wariant pełny', () => {
      const full = render(<TankLevelBar valueCm={100} maxCm={200} />);
      const fullTrack = full.container.querySelector(
        '[data-testid="tank-level-fill"]'
      )!.parentElement as HTMLElement;
      const fullRoot = full.container.firstElementChild as HTMLElement;
      full.unmount();

      const compact = render(<TankLevelBar valueCm={100} maxCm={200} compact />);
      const compactTrack = compact.container.querySelector(
        '[data-testid="tank-level-fill"]'
      )!.parentElement as HTMLElement;
      const compactRoot = compact.container.firstElementChild as HTMLElement;

      expect(compactRoot.className).not.toBe(fullRoot.className);
      expect(compactTrack.className).not.toBe(fullTrack.className);
      expect(compactRoot.className).not.toMatch(/rounded-\[2\.5rem\]/);
    });

    test('compact zachowuje poprawne wyliczenie wypełnienia (logika bez zmian)', () => {
      const { container } = render(<TankLevelBar valueCm={50} maxCm={200} compact />);
      const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
      expect(fill.style.height).toBe('25%');
    });

    test('compact + alarm=true nadal miga i wypełnia na czerwono', () => {
      const { container } = render(<TankLevelBar valueCm={100} maxCm={200} alarm compact />);
      const root = container.firstElementChild as HTMLElement;
      const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
      expect(root).toHaveClass('animate-alarm-flash');
      expect(fill.className).toMatch(/bg-rose/);
    });

    test('compact + offline=true nadal gasi wizualnie pasek', () => {
      const { container } = render(<TankLevelBar valueCm={100} maxCm={200} offline compact />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toMatch(/grayscale-\[0\.5\]/);
      expect(root.className).toMatch(/opacity-75/);
    });

    test('compact nadal renderuje wartość liczbową w cm', () => {
      render(<TankLevelBar valueCm={123} maxCm={200} compact />);
      expect(screen.getByText(/123/)).toBeInTheDocument();
    });
  });
});

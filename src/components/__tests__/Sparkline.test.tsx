import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '@/components/Sparkline';

describe('Sparkline', () => {
  test('renderuje svg z polyline dla listy wartości', () => {
    const { container } = render(<Sparkline history={[1, 2, 3, 2, 5]} />);
    const svg = container.querySelector('svg');
    const polyline = container.querySelector('polyline');
    expect(svg).toBeInTheDocument();
    expect(polyline).toBeInTheDocument();
    expect(polyline?.getAttribute('points')?.split(' ').length).toBe(5);
  });

  test('pusta historia: nie crashuje i nie renderuje polyline', () => {
    const { container } = render(<Sparkline history={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('polyline')).not.toBeInTheDocument();
  });

  test('pojedynczy punkt: nie crashuje, renderuje płaską linię na środku', () => {
    const { container } = render(<Sparkline history={[42]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    const points = polyline!.getAttribute('points')!.trim().split(' ');
    expect(points).toHaveLength(1);
  });

  test('wszystkie wartości równe (min === max): renderuje płaską linię na środku wysokości, bez dzielenia przez zero', () => {
    const { container } = render(<Sparkline history={[7, 7, 7, 7]} />);
    const polyline = container.querySelector('polyline');
    const points = polyline!
      .getAttribute('points')!
      .trim()
      .split(' ')
      .map((pair) => pair.split(',').map(Number));

    const ys = points.map(([, y]) => y);
    expect(ys.every((y) => Number.isFinite(y))).toBe(true);
    expect(new Set(ys).size).toBe(1);
  });

  test('przyjmuje niestandardowy className', () => {
    const { container } = render(<Sparkline history={[1, 2, 3]} className="text-emerald-500" />);
    expect(container.querySelector('svg')).toHaveClass('text-emerald-500');
  });

  test('punkty mieszczą się w zadanym viewBox (brak wartości ujemnych/poza zakresem)', () => {
    const { container } = render(<Sparkline history={[10, 1, 20, 5]} width={100} height={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 100 30');

    const polyline = container.querySelector('polyline');
    const points = polyline!
      .getAttribute('points')!
      .trim()
      .split(' ')
      .map((pair) => pair.split(',').map(Number));

    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
  });
});

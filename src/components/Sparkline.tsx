import { cn } from '@/lib/utils';

interface SparklineProps {
  history: number[];
  className?: string;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 32;

/**
 * Hand-rolled trend line — DesignGuideline §0 wyklucza biblioteki wykresów
 * dla tej apki, więc to zwykły `<polyline>` skalowany ręcznie do viewBoxu.
 */
export function Sparkline({
  history,
  className,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: SparklineProps) {
  const viewBox = `0 0 ${width} ${height}`;

  if (history.length === 0) {
    return (
      <svg
        viewBox={viewBox}
        width={width}
        height={height}
        className={cn('overflow-visible', className)}
      />
    );
  }

  const points = toPoints(history, width, height);

  return (
    <svg
      viewBox={viewBox}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function toPoints(history: number[], width: number, height: number): string {
  // Jeden punkt nie ma sąsiada do narysowania linii — traktujemy go jak
  // płaski przebieg na środku wysokości, tak samo jak przypadek min===max.
  if (history.length === 1) {
    return `${width / 2},${height / 2}`;
  }

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min;
  const stepX = width / (history.length - 1);

  return history
    .map((value, index) => {
      const x = index * stepX;
      // range===0 => wszystkie wartości identyczne — płaska linia na środku,
      // zamiast dzielenia przez zero.
      const y = range === 0 ? height / 2 : height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

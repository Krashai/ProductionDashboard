import { MetricCard } from '@/components/MetricCard';
import { TankLevelBar } from '@/components/TankLevelBar';
import { metricColorForUnit } from '@/lib/metric-color';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

interface CoolingAreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
}

export function CoolingAreaView({ area, definition }: CoolingAreaViewProps) {
  const offline = !area.isOnline;
  const levelMetric = area.metrics.find((m) => m.unit === 'cm');
  const cardMetrics = area.metrics.filter((m) => m.unit !== 'cm');

  return (
    // `items-center` zamiast domyślnego `stretch` — rząd kart dopasowuje się
    // do wysokości swojej realnej treści i wycentrowany w dostępnym `h-full`,
    // zamiast rozciągać każdą kartę do pełnej wysokości wiersza (audyt UI/UX,
    // martwa przestrzeń pod treścią kart na ekranie kioskowym).
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 2xl:gap-8 h-full items-center">
      {cardMetrics.map((metric) => (
        <MetricCard
          key={metric.id}
          testId={`metric-card-${metric.id}`}
          label={metric.label}
          value={metric.value}
          unit={metric.unit}
          decimals={metric.decimals}
          color={metricColorForUnit(metric.unit)}
          alarm={metric.alarm}
          offline={offline}
          history={metric.history}
        />
      ))}
      {levelMetric && (
        <TankLevelBar
          testId={`tank-level-${levelMetric.id}`}
          valueCm={levelMetric.value}
          maxCm={definition.maxCm ?? 100}
          alarm={levelMetric.alarm}
          offline={offline}
        />
      )}
    </div>
  );
}

import { MetricCard } from '@/components/MetricCard';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

interface PowerAreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
}

// 6 kart na jednym slajdzie bez scrolla: 2 kolumny na telefonie, 3 na
// desktopie, cała szóstka w jednym rzędzie dopiero w trybie TV (2xl) —
// DesignGuideline §3 traktuje `2xl:` jako tryb TV kioskowego.
//
// `items-center` zamiast domyślnego `stretch` — wiersz kart dopasowuje się
// do wysokości swojej realnej treści i wycentrowany w dostępnym `h-full`,
// zamiast rozciągać każdą kartę do pełnej wysokości wiersza (audyt UI/UX,
// martwa przestrzeń pod treścią kart na ekranie kioskowym).
const GRID_CLASSES =
  'grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-5 2xl:gap-8 h-full items-center';

export function PowerAreaView({ area, definition }: PowerAreaViewProps) {
  const offline = !area.isOnline;

  return (
    <div className={GRID_CLASSES}>
      {area.metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          testId={`metric-card-${metric.id}`}
          label={metric.label}
          value={metric.value}
          unit={metric.unit}
          decimals={metric.decimals}
          alarm={metric.alarm}
          offline={offline}
          history={metric.history}
        />
      ))}
    </div>
  );
}

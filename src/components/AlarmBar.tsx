import { cn } from '@/lib/utils';
import type { AlarmState, AreaSnapshot } from '@/lib/types';

interface AlarmBarProps {
  areas: AreaSnapshot[];
  className?: string;
}

/**
 * Decyzja #15 (Concept.md): pasek jest niezależny od pozycji karuzeli — zbiera
 * alarmy ze WSZYSTKICH obszarów naraz, nie tylko z aktualnie widocznego.
 */
export function collectAlarms(areas: AreaSnapshot[]): AlarmState[] {
  return areas.flatMap((area) =>
    area.metrics
      .filter((metric) => metric.alarm)
      .map((metric) => ({
        areaId: area.id,
        areaName: area.name,
        metricId: metric.id,
        metricLabel: metric.label,
      }))
  );
}

export function AlarmBar({ areas, className }: AlarmBarProps) {
  const alarms = collectAlarms(areas);

  return (
    <div
      data-testid="alarm-bar"
      className={cn(
        'shrink-0 w-full border-t border-slate-100 bg-white',
        className
      )}
    >
      {/* `role="status" aria-live="polite"`: to system alarmowy infrastruktury —
       * pojawienie się/zniknięcie chipa musi zostać ogłoszone czytnikowi
       * ekranu, inaczej operator korzystający z asystującej technologii nigdy
       * się nie dowie o nowym alarmie (audyt dostępności, ustalenie §2,
       * WCAG 4.1.3). `polite`, nie `assertive` — nie przerywa bieżącej
       * wypowiedzi, alarm i tak zostaje na ekranie aż do ustąpienia. */}
      <div
        role="status"
        aria-live="polite"
        className="max-w-[2400px] mx-auto px-6 2xl:px-10 py-3 2xl:py-4 flex flex-wrap items-center gap-3"
      >
        {alarms.length === 0 ? (
          <span
            data-testid="alarm-chip-ok"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest bg-emerald-50 border-emerald-100 text-emerald-700"
          >
            Wszystko OK
          </span>
        ) : (
          alarms.map((alarm) => (
            <span
              key={`${alarm.areaId}-${alarm.metricId}`}
              data-testid={`alarm-chip-${alarm.areaId}-${alarm.metricId}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest bg-rose-50 border-rose-200 text-rose-800 animate-pulse-subtle motion-reduce:animate-none"
            >
              {alarm.areaName} — {alarm.metricLabel}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

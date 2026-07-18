import { cn } from '@/lib/utils';
import { Counter } from '@/components/Counter';
import { Sparkline } from '@/components/Sparkline';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

interface CompressorAreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
}

/**
 * Decyzja #17 (Concept.md): jedna karta "Ciśnienie sieci" z dwoma wartościami
 * obok siebie — nie dwie osobne MetricCard. Pulsowanie alarmu jest jednak
 * per-odczyt (decyzja #16), więc każdy punkt pomiarowy ma własny akcent
 * błędu wewnątrz wspólnej ramki karty.
 */
export function CompressorAreaView({ area, definition }: CompressorAreaViewProps) {
  const offline = !area.isOnline;

  return (
    // `h-full` + centrowanie idzie tu, na rodzicu — nie na samej karcie
    // (to był najgorszy przypadek audytu: jedna karta rozciągnięta na całą
    // wysokość ekranu z dwiema liczbami pływającymi blisko środka). Karta ma
    // teraz naturalną wysokość swojej treści i jest wycentrowana w dostępnej
    // przestrzeni, zamiast być tą przestrzenią.
    <div className="h-full flex items-center justify-center">
      <div
        data-testid="compressor-pressure-card"
        className={cn(
          'bg-white border border-slate-200 rounded-[2.5rem] p-8 2xl:p-10 shadow-sm flex flex-col gap-6 transition-all duration-500',
          offline && 'grayscale-[0.5] opacity-75'
        )}
      >
        {/* `p`, nie `h3` — podpis grupy kart, nie nagłówek strukturalny
         * (audyt dostępności, ustalenie §2). */}
        <p className="text-center text-[11px] font-black text-slate-600 uppercase tracking-[0.4em]">
          Ciśnienie sieci
        </p>
        <div className="flex flex-col sm:flex-row gap-6 2xl:gap-10 justify-center">
          {area.metrics.map((metric) => (
            <PressureReading key={metric.id} metric={metric} offline={offline} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PressureReading({ metric, offline }: { metric: Metric; offline: boolean }) {
  return (
    <div
      data-testid={`compressor-reading-${metric.id}`}
      className={cn(
        'flex-1 flex flex-col items-center gap-3 rounded-[1.5rem] border p-6 transition-all duration-500',
        metric.alarm ? 'border-rose-200 animate-pulse-subtle motion-reduce:animate-none' : 'border-slate-100'
      )}
    >
      {/* `p`, nie `h4` — podpis pojedynczego odczytu, nie nagłówek
       * strukturalny (audyt dostępności, ustalenie §2, jak wyżej). */}
      <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">
        {metric.label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl 2xl:text-5xl font-black tracking-tighter tabular-nums leading-none text-slate-900">
          {offline ? <span className="text-slate-500">—</span> : <Counter value={metric.value} decimals={metric.decimals} />}
        </span>
        <span className="text-base font-black text-slate-500 uppercase">{metric.unit}</span>
      </div>
      {metric.history.length > 0 && (
        <Sparkline
          history={metric.history}
          className={metric.alarm ? 'text-rose-500' : 'text-blue-500'}
          width={100}
          height={28}
        />
      )}
    </div>
  );
}

import { CoolingAreaView } from '@/components/areas/CoolingAreaView';
import { CompressorAreaView } from '@/components/areas/CompressorAreaView';
import { PowerAreaView } from '@/components/areas/PowerAreaView';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

interface AreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
  /** Czas klienta (epoch ms) do oceny wieku danych — z `useNow`. Opcjonalny
   * tylko po to, by widoki dało się renderować bez tykania zegara; bez niego
   * używają `Date.now()` z chwili renderu. */
  now?: number;
}

/**
 * Dispatcher layoutu per `area.type` — jedyne miejsce, które musi znać
 * mapowanie typ→widok, żeby karuzela (Faza 4) mogła renderować dowolny
 * obszar bez własnej logiki warunkowej.
 */
export function AreaView({ area, definition, now }: AreaViewProps) {
  switch (area.type) {
    case 'cooling':
      return <CoolingAreaView area={area} definition={definition} now={now} />;
    case 'compressor':
      return <CompressorAreaView area={area} definition={definition} now={now} />;
    case 'power':
      return <PowerAreaView area={area} definition={definition} now={now} />;
  }
}

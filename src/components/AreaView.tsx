import { CoolingAreaView } from '@/components/areas/CoolingAreaView';
import { CompressorAreaView } from '@/components/areas/CompressorAreaView';
import { PowerAreaView } from '@/components/areas/PowerAreaView';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

interface AreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
}

/**
 * Dispatcher layoutu per `area.type` — jedyne miejsce, które musi znać
 * mapowanie typ→widok, żeby karuzela (Faza 4) mogła renderować dowolny
 * obszar bez własnej logiki warunkowej.
 */
export function AreaView({ area, definition }: AreaViewProps) {
  switch (area.type) {
    case 'cooling':
      return <CoolingAreaView area={area} definition={definition} />;
    case 'compressor':
      return <CompressorAreaView area={area} definition={definition} />;
    case 'power':
      return <PowerAreaView area={area} definition={definition} />;
  }
}

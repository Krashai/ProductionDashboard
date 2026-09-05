import {
  SubstationCard,
  SUBSTATION_GROUP_ICONS,
  type SubstationGroup,
  type SubstationTile,
} from '@/components/SubstationCard';
import {
  CURRENT_DEVIATION_FULL_SCALE,
  VOLTAGE_DEVIATION_FULL_SCALE,
  computePhaseDeviations,
} from '@/lib/phase-balance';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

interface PowerAreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
}

const SUBSTATIONS = [1, 2, 3];

// Sufiksy metric id (patrz `powerArea()` w src/lib/areas.ts) pogrupowane po 3
// — dokładnie tyle, ile mieści rząd siatki kafli. Kolejność grup MUSI
// odzwierciedlać kolejność notatek źródłowych (napięcia → prądy → moc →
// temperatura → THD), ta sama co w `powerArea()`. Temperatura i THD dzielą
// jeden rząd, bo osobno dawałyby 5 rzędów (1 + 2 kafle) — przy 1366×768 piąty
// rząd nie mieści się w kolumnie, a dwa niepełne rzędy rozbijają rytm siatki.
//
// `short` to etykieta WYŚWIETLANA na kaflu i jest świadomie zapisana wprost,
// a nie wycinana z `metric.label` regexem. Rejestr (`src/lib/areas.ts`) musi
// zostać z pełnymi etykietami ("Trafostacja 2 — Moc czynna"), bo `AlarmBar`
// skleja `area.name` + `metric.label` i jest jedynym miejscem, z którego
// operator dowiaduje się, której trafostacji dotyczy alarm. Skracamy więc
// tylko na wyświetlaniu — tak samo jak `stripSectionPrefix`, ale bez operacji
// na tekście: "Moc czynna"→"Czynna" ścina PRZEDROSTEK, a "L1 (prąd)"→"L1"
// ścina PRZYROSTEK, więc jeden wzorzec na oba byłby kruchy i nietestowalny.
// Nagłówek grupy nad rzędem niesie wycięte słowo ("MOC", "PRĄDY"), przez co
// powtarzanie go na każdym z 3 kafli nie dodaje ani bitu informacji.
//
// `deviationFullScale` — grupa to te same trzy fazy jednej wielkości, więc
// kafle dostają pasek rozbieżny asymetrii (patrz `PhaseBalanceBar`), a liczba
// mówi, jaka odchyłka od średniej faz dobija do końca toru. Napięcia dostają
// ciaśniejszą skalę niż prądy — uzasadnienie obu liczb siedzi przy stałych w
// `src/lib/phase-balance.ts` i TAM się je stroi, nie tutaj.
//
// Moc i Temperatura/THD paska nie mają: kW vs kVAr vs kVA (a tym bardziej °C
// vs % vs %) to trzy różne wielkości, nie trzy odczyty tej samej, więc ich
// "średnia" nie jest niczym fizycznym.
const GROUPS: {
  label: string;
  icon: SubstationGroup['icon'];
  rows: { suffix: string; short: string }[];
  deviationFullScale?: number;
}[] = [
  {
    label: 'Napięcia',
    icon: SUBSTATION_GROUP_ICONS.napiecia,
    deviationFullScale: VOLTAGE_DEVIATION_FULL_SCALE,
    rows: [
      { suffix: 'l1n', short: 'L1N' },
      { suffix: 'l2n', short: 'L2N' },
      { suffix: 'l3n', short: 'L3N' },
    ],
  },
  {
    label: 'Prądy',
    icon: SUBSTATION_GROUP_ICONS.prady,
    deviationFullScale: CURRENT_DEVIATION_FULL_SCALE,
    rows: [
      { suffix: 'prad-l1', short: 'L1' },
      { suffix: 'prad-l2', short: 'L2' },
      { suffix: 'prad-l3', short: 'L3' },
    ],
  },
  {
    label: 'Moc',
    icon: SUBSTATION_GROUP_ICONS.moc,
    rows: [
      { suffix: 'active', short: 'Czynna' },
      { suffix: 'reactive', short: 'Bierna' },
      { suffix: 'apparent', short: 'Pozorna' },
    ],
  },
  {
    label: 'Temperatura i THD',
    icon: SUBSTATION_GROUP_ICONS.temperaturaThd,
    rows: [
      { suffix: 'temperatura', short: 'Temperatura' },
      { suffix: 'thdi', short: 'THDi' },
      { suffix: 'thdu', short: 'THDu' },
    ],
  },
];

function buildGroupsForSubstation(n: number, metricsById: Map<string, Metric>): SubstationGroup[] {
  return GROUPS.map((group) => {
    const present = group.rows
      .map((row) => {
        const metric = metricsById.get(`trafostacja-${n}-${row.suffix}`);
        return metric ? { metric, label: row.short } : undefined;
      })
      .filter((tile): tile is Omit<SubstationTile, 'phaseDeviation'> => tile !== undefined);

    // Punkt zerowy paska jest lokalny: średnia liczona z wartości TEJ grupy
    // TEJ trafostacji. Wspólna średnia między trafostacjami ukryłaby
    // niesymetrię na słabiej obciążonej z nich, a między grupami uśredniałaby
    // wolty z amperami. Sama SKALA (ile toru dostaje procent odchyłki) jest za
    // to wspólna i stała — dzięki temu ten sam rozjazd wygląda tak samo na
    // każdej z trzech kolumn.
    const deviations = group.deviationFullScale
      ? computePhaseDeviations(
          present.map((tile) => tile.metric.value),
          group.deviationFullScale
        )
      : null;

    return {
      label: group.label,
      icon: group.icon,
      metrics: present.map((tile, index) => ({
        ...tile,
        phaseDeviation: deviations ? deviations[index] : null,
      })),
    };
  });
}

/**
 * Ekran szczegółowy "Energia elektryczna" — 3 równe kolumny (jedna na
 * trafostację, wymóg notatek źródłowych), każda z siatką 12 kafli 3×4 pod
 * czterema mikro-nagłówkami grup.
 *
 * Poprzednia wersja (gęsty "arkusz danych": 12 wierszy "etykieta ... wartość"
 * na kolumnę) została odrzucona przez użytkownika — czytała się jak wydruk z
 * licznika, nie jak wallboard. Kafle wracają, ale w wariancie `size="sm"`
 * `OverviewMetricTile`, więc gęstość zostaje ta sama (36 wartości bez
 * scrolla), a hierarchia typograficzna wraca: wartość dominuje, etykieta
 * schodzi do roli podpisu.
 *
 * `definition` przyjmowana wyłącznie dla spójności sygnatury z resztą
 * `AreaView`-podobnych komponentów (patrz `CoolingAreaView`/
 * `CompressorAreaView`) — grupowanie działa bezpośrednio na `area.metrics` po
 * prefiksie id (`trafostacja-{n}-*`), nie potrzebuje `AreaDefinition.metrics`.
 */
export function PowerAreaView({ area }: PowerAreaViewProps) {
  const offline = !area.isOnline;
  const metricsById = new Map(area.metrics.map((metric) => [metric.id, metric]));

  return (
    <div className="grid grid-cols-3 gap-3 xl:gap-4 2xl:gap-8 h-full">
      {SUBSTATIONS.map((n) => (
        <SubstationCard
          key={n}
          id={`trafostacja-${n}`}
          title={`Trafostacja ${n}`}
          groups={buildGroupsForSubstation(n, metricsById)}
          offline={offline}
          className="min-h-0"
        />
      ))}
    </div>
  );
}

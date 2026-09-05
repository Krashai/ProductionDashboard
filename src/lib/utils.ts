import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// PLC sporadycznie zwraca drobny ujemny szum na czujnikach, które fizycznie
// nigdy nie są ujemne (np. -0.05 bar ciśnienia) — obcinamy to WYŁĄCZNIE na
// potrzeby wyświetlania. Surowa `value`/`history` używana do sparkline i
// oceny alarmu zostaje nietknięta (alarm i trend muszą widzieć realny odczyt).
export function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

// `metric.label` w rejestrze (`src/lib/areas.ts`) zaczyna się od nazwy sekcji
// — "Magazyn Bębnów — Ciśnienie kolektor", "Trafostacja 2 — Moc czynna". To
// celowe i MUSI tak zostać: `AlarmBar` skleja `area.name` z `metric.label`
// bez żadnej wiedzy o sekcjach (patrz `collectAlarms`), więc bez prefiksu
// operator nie wiedziałby, której trafostacji/którego magazynu dotyczy alarm.
// Wewnątrz karty danej sekcji ten prefiks jest jednak zbędny — nagłówek karty
// już go pokazuje — a przy wąskim kaflu (`truncate` w `OverviewMetricTile`)
// zjadał całą szerokość etykiety ("TRAFOSTACJA 2 — MOC…"). Ścinamy go
// WYŁĄCZNIE na potrzeby wyświetlania; `area.metrics`/`AlarmBar` nadal widzą
// pełną, oryginalną etykietę.
export function stripSectionPrefix(label: string, heading: string): string {
  const prefix = `${heading} — `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

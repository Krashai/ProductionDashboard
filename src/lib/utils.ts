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

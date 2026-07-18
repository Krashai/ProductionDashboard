'use client'

import { cn } from '@/lib/utils'
import { Radio, WifiOff, Loader2 } from 'lucide-react'
import type { ConnectionStatus as DataConnectionStatus } from '@/hooks/useAreasData'

interface Props {
  status: DataConnectionStatus
  /** Ostatni event ze streamu. null = brak zmian od mount — to nie awaria. */
  lastEventAt: Date | null
  className?: string
}

/**
 * Wskaźnik stanu kanału real-time.
 *
 * Port ConnectionStatus z ProductionMonitor — status ma tu wartości
 * 'connecting' | 'live' | 'offline' (zamiast oryginalnych
 * 'connecting' | 'connected' | 'disconnected'), bo to słownictwo już przyjęte
 * w `useAreasData` (Faza 2) i to ten hook zasili ten komponent w Fazie 4 —
 * unikamy dodatkowej warstwy mapowania nazw statusów.
 *
 * Tooltip rozróżnia dwie sytuacje, które wcześniej wyglądały tak samo:
 * - live + lastEventAt null → "LIVE, bez zmian" (zdrowy idle)
 * - live + lastEventAt stary → "LIVE, ostatnia zmiana o HH:MM"
 */
export function ConnectionStatus({ status, lastEventAt, className }: Props) {
  const label =
    status === 'live' ? 'LIVE' : status === 'connecting' ? 'ŁĄCZENIE' : 'OFFLINE'

  const Icon =
    status === 'live' ? Radio : status === 'connecting' ? Loader2 : WifiOff

  const titleText = (() => {
    if (status === 'offline') return 'Brak połączenia z serwerem. Próba wznowienia w toku.'
    if (status === 'connecting') return 'Łączenie z serwerem realtime...'
    if (!lastEventAt) return 'LIVE — brak zmian od otwarcia karty (obszar stabilny).'
    return `LIVE — ostatnia zmiana: ${lastEventAt.toLocaleTimeString('pl-PL')}`
  })()

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors',
        status === 'live' && 'bg-emerald-50 border-emerald-100 text-emerald-700',
        status === 'connecting' && 'bg-amber-50 border-amber-100 text-amber-700',
        // text-rose-800, nie -700: sam wzorzec kontrastu co w AlarmBar.tsx
        // (audyt dostępności, ustalenie §1) — nie było w oryginalnym skanie
        // bo status akurat nie był offline w tamtej próbce, ale to identyczna
        // para kolorów, więc identyczna usterka.
        status === 'offline' && 'bg-rose-50 border-rose-100 text-rose-800',
        className,
      )}
      title={titleText}
    >
      <Icon
        size={12}
        className={cn(
          status === 'live' && 'animate-pulse motion-reduce:animate-none',
          status === 'connecting' && 'animate-spin motion-reduce:animate-none',
        )}
      />
      <span>{label}</span>
    </div>
  )
}

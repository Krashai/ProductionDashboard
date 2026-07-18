'use client'

import { useCallback, useEffect, useState } from 'react';

// Concept.md §9 zał. 6: rotacja na stałe 18s (środek zakresu 15-20s z decyzji #7).
export const ROTATION_TIME_MS = 18000;
const PROGRESS_TICK_MS = 100;

export interface UseCarouselOptions {
  rotationTimeMs?: number;
  /** Pozwala wyłączyć rotację bez zmiany isPlaying — potrzebne w trybie
   * pinned (Concept.md §6), gdzie hook musi zostać wywołany (reguły hooków),
   * ale jego timer nie powinien w ogóle działać. */
  enabled?: boolean;
}

export interface UseCarouselResult {
  currentIndex: number;
  isPlaying: boolean;
  progress: number;
  selectIndex: (index: number) => void;
  togglePlay: () => void;
}

export function useCarousel(
  itemCount: number,
  options: UseCarouselOptions = {}
): UseCarouselResult {
  const { rotationTimeMs = ROTATION_TIME_MS, enabled = true } = options;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (itemCount > 0 ? (prev + 1) % itemCount : 0));
    setProgress(0);
  }, [itemCount]);

  useEffect(() => {
    if (!enabled || !isPlaying || itemCount === 0) return;

    // Kolejność rejestracji ma znaczenie: gdy rotationTimeMs jest
    // wielokrotnością PROGRESS_TICK_MS, oba interwały odpalają się w tym
    // samym ticku. progressInterval musi wystartować jako pierwszy, żeby
    // reset z nextSlide (który biegnie jako drugi) był ostatnim słowem —
    // inaczej progress "przeskakuje" o jeden krok tuż po resecie do 0.
    const progressInterval = setInterval(() => {
      setProgress((prev) =>
        prev >= 100 ? 0 : prev + (100 / (rotationTimeMs / PROGRESS_TICK_MS))
      );
    }, PROGRESS_TICK_MS);
    const interval = setInterval(nextSlide, rotationTimeMs);

    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [enabled, isPlaying, nextSlide, itemCount, rotationTimeMs]);

  const selectIndex = useCallback((index: number) => {
    setCurrentIndex(index);
    setProgress(0);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      // Wznowienie resetuje progress; pauza zamraża pasek tam, gdzie stanął
      // — port dokładnie tej samej logiki z MainDashboard.tsx.
      if (next) setProgress(0);
      return next;
    });
  }, []);

  return { currentIndex, isPlaying, progress, selectIndex, togglePlay };
}

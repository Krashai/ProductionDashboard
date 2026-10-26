/**
 * Czy użytkownik prosi o ograniczony ruch. Bez mrugania (logo i favicony) —
 * CSS i tak wyłącza animację, ale nie ma sensu też przełączać stanu ani
 * podmieniać favicony. Wołać tylko po stronie klienta (w efekcie).
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

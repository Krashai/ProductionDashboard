import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Counter } from '@/components/Counter';

describe('Counter', () => {
  test('renderuje się bez błędu i pokazuje liczbę z zadaną precyzją', () => {
    render(<Counter value={5} decimals={2} />);
    // Animacja count-up startuje od 0 — sprawdzamy sam brak crasha i format liczby.
    const text = screen.getByText(/^\d+\.\d{2}$/);
    expect(text).toBeInTheDocument();
  });

  test('domyślna precyzja to 1 miejsce po przecinku', () => {
    render(<Counter value={3} />);
    expect(screen.getByText(/^\d+\.\d$/)).toBeInTheDocument();
  });
});

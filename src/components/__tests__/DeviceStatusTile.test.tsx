import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceStatusTile } from '@/components/DeviceStatusTile';

// Patrz uzasadnienie w MetricCard.test.tsx — rAF nie odpala synchronicznie w jsdom.
vi.mock('@/components/Counter', () => ({
  Counter: ({ value, decimals = 1 }: { value: number; decimals?: number }) => (
    <>{value.toFixed(decimals)}</>
  ),
}));

describe('DeviceStatusTile', () => {
  test('renderuje etykietę urządzenia', () => {
    render(<DeviceStatusTile label="V101" running={false} fault={false} />);
    expect(screen.getByText('V101')).toBeInTheDocument();
  });

  test('running=true: kropka PRACA jest emerald', () => {
    const { getByTestId } = render(<DeviceStatusTile label="V101" running={true} fault={false} />);
    expect(getByTestId('device-running-dot').className).toMatch(/bg-emerald-500/);
  });

  test('running=false: kropka PRACA jest szara', () => {
    const { getByTestId } = render(<DeviceStatusTile label="V101" running={false} fault={false} />);
    expect(getByTestId('device-running-dot').className).toMatch(/bg-slate-300/);
  });

  test('fault=true: kropka AWARIA jest rose i miga (animate-alarm-flash)', () => {
    const { getByTestId, container } = render(<DeviceStatusTile label="V101" running={false} fault={true} />);
    expect(getByTestId('device-fault-dot').className).toMatch(/bg-rose-500/);
    expect(getByTestId('device-fault-dot').className).toMatch(/animate-alarm-flash/);
    // Cały kafel dostaje akcent/poświatę rose, tak jak MetricCard w alarmie.
    expect(container.firstChild).toHaveClass('shadow-[2px_0_20px_rgba(225,29,72,0.3)]');
  });

  test('fault=false: kropka AWARIA jest szara i nie miga', () => {
    const { getByTestId } = render(<DeviceStatusTile label="V101" running={true} fault={false} />);
    expect(getByTestId('device-fault-dot').className).toMatch(/bg-slate-300/);
    expect(getByTestId('device-fault-dot').className).not.toMatch(/animate-alarm-flash/);
  });

  // WCAG 1.4.1 (audyt review, sierpień 2026): stan PRACA/AWARIA nie może być
  // sygnalizowany wyłącznie kolorem kropki — czytnik ekranu musi dostać
  // tekstowy odpowiednik, inaczej "Praca"/"Awaria" jako statyczne etykiety są
  // bez znaczenia niezależnie od faktycznego stanu urządzenia.
  test('kropki PRACA/AWARIA są aria-hidden, stan dostępny tylko przez tekst sr-only', () => {
    const { getByTestId } = render(<DeviceStatusTile label="V101" running={true} fault={false} />);
    expect(getByTestId('device-running-dot')).toHaveAttribute('aria-hidden', 'true');
    expect(getByTestId('device-fault-dot')).toHaveAttribute('aria-hidden', 'true');
  });

  test('running=true/fault=false: tekst sr-only ogłasza "Praca: tak" i "Awaria: nie"', () => {
    const { getByTestId } = render(<DeviceStatusTile label="V101" running={true} fault={false} />);
    expect(getByTestId('device-running-status')).toHaveTextContent('Praca: tak');
    expect(getByTestId('device-fault-status')).toHaveTextContent('Awaria: nie');
  });

  test('running=false/fault=true: tekst sr-only ogłasza "Praca: nie" i "Awaria: tak"', () => {
    const { getByTestId } = render(<DeviceStatusTile label="V101" running={false} fault={true} />);
    expect(getByTestId('device-running-status')).toHaveTextContent('Praca: nie');
    expect(getByTestId('device-fault-status')).toHaveTextContent('Awaria: tak');
  });

  test('offline=true: kafel jest grayscale/przezroczysty', () => {
    const { container } = render(<DeviceStatusTile label="V101" running={true} fault={false} offline />);
    expect(container.firstChild).toHaveClass('grayscale-[0.5]');
    expect(container.firstChild).toHaveClass('opacity-75');
  });

  test('secondaryValue=null, reserveSecondaryRow=false (domyślnie): nie renderuje wiersza wcale', () => {
    render(<DeviceStatusTile label="V101" running={true} fault={false} />);
    expect(screen.queryByTestId('device-secondary-row')).not.toBeInTheDocument();
  });

  test('secondaryValue=null, reserveSecondaryRow=true: wiersz zostaje w DOM (rezerwuje wysokość), ale jest niewidoczny', () => {
    const { getByTestId } = render(
      <DeviceStatusTile label="Pompa 2" running={true} fault={false} reserveSecondaryRow />
    );
    const secondaryRow = getByTestId('device-secondary-row');
    expect(secondaryRow).toBeInTheDocument();
    expect(secondaryRow).toHaveClass('invisible');
    expect(secondaryRow).toHaveAttribute('aria-hidden', 'true');
  });

  test('secondaryValue podane z jednostką Hz: renderuje wartość z jednostką, wiersz jest widoczny', () => {
    const { getByTestId } = render(
      <DeviceStatusTile label="Pompa 1" running={true} fault={false} secondaryValue={42.5} secondaryUnit="Hz" />
    );
    expect(screen.getByText('42.5')).toBeInTheDocument();
    expect(screen.getByText('Hz')).toBeInTheDocument();
    const secondaryRow = getByTestId('device-secondary-row');
    expect(secondaryRow).not.toHaveClass('invisible');
    expect(secondaryRow).not.toHaveAttribute('aria-hidden');
    // Herc to "Hz", nie "HZ" — asercja po klasie, bo `text-transform` nie
    // zmienia treści DOM (patrz analogiczny test w OverviewMetricTile.test).
    expect(screen.getByText('Hz').className).not.toMatch(/uppercase|lowercase|capitalize/);
  });

  test('secondaryValue podane + offline: pokazuje "—" zamiast wartości', () => {
    render(<DeviceStatusTile label="Pompa 1" running={false} fault={false} secondaryValue={42.5} secondaryUnit="Hz" offline />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('42.5')).not.toBeInTheDocument();
  });

  // Chłodnia 3 (wrzesień 2026): Darpin — "poziom pracy" bez jednostki, liczba
  // całkowita (secondaryDecimals=0, tak jak realnie dostarcza CoolingAreaView
  // z `device.secondaryDecimals`) — inaczej dyskretny poziom pracy wyglądałby
  // na kiosku jak pomiar analogowy ("2.0").
  test('secondaryUnit="" (falsy): renderuje wartość BEZ elementu jednostki (brak osieroconej spacji/pustego <span>)', () => {
    const { getByTestId } = render(
      <DeviceStatusTile
        label="Darpin"
        running={true}
        fault={false}
        secondaryValue={2}
        secondaryUnit=""
        secondaryDecimals={0}
      />
    );
    const secondaryRow = getByTestId('device-secondary-row');
    expect(secondaryRow).toHaveTextContent('2');
    expect(secondaryRow).not.toHaveTextContent('2.0');
    // Dokładnie jeden potomek — wartość; brak drugiego elementu na jednostkę.
    expect(secondaryRow.children).toHaveLength(1);
  });

  test('secondaryDecimals domyślnie 1 (zgodność wsteczna z Hz), jawne 0 obcina miejsca po przecinku', () => {
    const { rerender, getByTestId } = render(
      <DeviceStatusTile label="Pompa 1" running={true} fault={false} secondaryValue={42} secondaryUnit="Hz" />
    );
    expect(getByTestId('device-secondary-row')).toHaveTextContent('42.0');

    rerender(
      <DeviceStatusTile
        label="Darpin"
        running={true}
        fault={false}
        secondaryValue={2}
        secondaryUnit=""
        secondaryDecimals={0}
      />
    );
    expect(getByTestId('device-secondary-row')).toHaveTextContent('2');
  });

  describe('pasek akcentu (deviceAccentBarClasses)', () => {
    test('running=true, fault=false: pasek jest emerald', () => {
      const { getByTestId } = render(<DeviceStatusTile label="V101" running={true} fault={false} />);
      expect(getByTestId('device-accent-bar').className).toMatch(/bg-emerald-500/);
    });

    test('running=false, fault=false: pasek jest neutralny (slate)', () => {
      const { getByTestId } = render(<DeviceStatusTile label="V101" running={false} fault={false} />);
      const bar = getByTestId('device-accent-bar').className;
      expect(bar).toMatch(/bg-slate-300/);
      expect(bar).not.toMatch(/bg-emerald-500/);
      expect(bar).not.toMatch(/bg-rose-500/);
    });

    test('fault=true ma pierwszeństwo nad running: pasek jest rose, nie emerald', () => {
      const { getByTestId } = render(<DeviceStatusTile label="V101" running={true} fault={true} />);
      const bar = getByTestId('device-accent-bar').className;
      expect(bar).toMatch(/bg-rose-500/);
      expect(bar).not.toMatch(/bg-emerald-500/);
    });
  });
  // Sprężarkownia stawia w rzędzie tylko dwa urządzenia (Chłodnia do pięciu),
  // więc kafel dostaje tam własny, większy rozmiar. Domyślny MUSI zostać
  // nietknięty — budżet szerokości rzędu 5 pomp jest policzony co do piksela.
  describe('size', () => {
    test('domyślnie (brak propa) kafel ma stałą szerokość rzędu Chłodni', () => {
      const { container } = render(<DeviceStatusTile label="V101" running={false} fault={false} />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toMatch(/(^|\s)w-32(\s|$)/);
      expect(root.className).toMatch(/(^|\s)xl:w-36(\s|$)/);
      expect(root.className).toMatch(/(^|\s)2xl:w-56(\s|$)/);
    });

    test('size="lg" NIE ustawia szerokości — kafel wypełnia komórkę siatki sekcji', () => {
      const { container } = render(<DeviceStatusTile label="V101" running={false} fault={false} size="lg" />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).not.toMatch(/(^|\s)w-32(\s|$)/);
      expect(root.className).not.toMatch(/(^|\s)2xl:w-56(\s|$)/);
    });

    test('size="lg" powiększa kropki stanu (to one są treścią czytaną z dystansu)', () => {
      const { getByTestId: getLg } = render(
        <DeviceStatusTile label="V101" running={true} fault={false} size="lg" />
      );
      expect(getLg('device-running-dot').className).toMatch(/(^|\s)2xl:w-16(\s|$)/);
      expect(getLg('device-fault-dot').className).toMatch(/(^|\s)2xl:w-16(\s|$)/);
    });

    test('size="lg" zachowuje reguły stanu i tekst sr-only (WCAG 1.4.1)', () => {
      const { getByTestId } = render(
        <DeviceStatusTile label="V101" running={false} fault={true} size="lg" />
      );
      expect(getByTestId('device-fault-dot').className).toMatch(/bg-rose-500/);
      expect(getByTestId('device-fault-dot').className).toMatch(/animate-alarm-flash/);
      expect(getByTestId('device-accent-bar').className).toMatch(/bg-rose-500/);
      expect(getByTestId('device-fault-status')).toHaveTextContent('Awaria: tak');
    });
  });
});

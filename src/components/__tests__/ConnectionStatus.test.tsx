import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from '@/components/ConnectionStatus';

describe('ConnectionStatus', () => {
  test('status "live" pokazuje etykietę LIVE', () => {
    render(<ConnectionStatus status="live" lastEventAt={null} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  test('status "connecting" pokazuje etykietę ŁĄCZENIE', () => {
    render(<ConnectionStatus status="connecting" lastEventAt={null} />);
    expect(screen.getByText('ŁĄCZENIE')).toBeInTheDocument();
  });

  test('status "offline" pokazuje etykietę OFFLINE', () => {
    render(<ConnectionStatus status="offline" lastEventAt={null} />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  test('lastEventAt=null przy statusie live tłumaczy się na tytuł "brak zmian"', () => {
    render(<ConnectionStatus status="live" lastEventAt={null} />);
    expect(screen.getByText('LIVE').closest('div')).toHaveAttribute(
      'title',
      expect.stringContaining('brak zmian')
    );
  });
});

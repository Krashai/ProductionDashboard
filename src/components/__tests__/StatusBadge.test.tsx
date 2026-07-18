import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { StatusBadge } from '@/components/StatusBadge';

describe('StatusBadge', () => {
  test('status=true renderuje wariant emerald', () => {
    const { container } = render(<StatusBadge status={true} />);
    expect(container.querySelector('.bg-emerald-50')).toBeInTheDocument();
  });

  test('status=false renderuje wariant rose', () => {
    const { container } = render(<StatusBadge status={false} />);
    expect(container.querySelector('.bg-rose-50')).toBeInTheDocument();
  });

  test('status=undefined renderuje wariant slate (neutralny)', () => {
    const { container } = render(<StatusBadge status={undefined} />);
    expect(container.querySelector('.bg-slate-50')).toBeInTheDocument();
  });
});

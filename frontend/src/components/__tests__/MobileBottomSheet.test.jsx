import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import MobileBottomSheet from '../MobileBottomSheet';

function renderSheet(props = {}) {
  const onSnapChange = vi.fn();
  render(
    <MobileBottomSheet snap="peek" onSnapChange={onSnapChange} {...props}>
      <div data-testid="sheet-child">תוכן</div>
    </MobileBottomSheet>,
  );
  return { onSnapChange };
}

describe('MobileBottomSheet', () => {
  it('renders its children', () => {
    renderSheet();
    expect(screen.getByTestId('sheet-child')).toBeInTheDocument();
  });

  it('exposes the current snap via a data attribute', () => {
    renderSheet({ snap: 'half' });
    expect(screen.getByTestId('mobile-bottom-sheet')).toHaveAttribute('data-snap', 'half');
  });

  it('renders a drag handle button', () => {
    renderSheet();
    expect(
      screen.getByRole('button', { name: 'הרחב או כווץ את רשימת הדיווחים' }),
    ).toBeInTheDocument();
  });

  it('steps up one snap level when the handle is tapped from peek', async () => {
    const user = userEvent.setup();
    const { onSnapChange } = renderSheet({ snap: 'peek' });
    await user.click(screen.getByRole('button', { name: 'הרחב או כווץ את רשימת הדיווחים' }));
    expect(onSnapChange).toHaveBeenCalledWith('half');
  });

  it('collapses back to peek when the handle is tapped from full', async () => {
    const user = userEvent.setup();
    const { onSnapChange } = renderSheet({ snap: 'full' });
    await user.click(screen.getByRole('button', { name: 'הרחב או כווץ את רשימת הדיווחים' }));
    expect(onSnapChange).toHaveBeenCalledWith('peek');
  });
});

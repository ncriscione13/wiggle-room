// Small corner status chip (M0.1). The full debug overlay arrives in M0.4;
// until then this is where the camera's actual resolution and fps show up.

import { colors, px, typography } from '../ui/theme';

export function mountStatusChip(root: HTMLElement, testid: string, text: string): HTMLElement {
  const chip = document.createElement('div');
  chip.setAttribute('data-testid', testid);
  chip.textContent = text;
  Object.assign(chip.style, {
    position: 'fixed',
    bottom: px(16),
    right: px(16),
    zIndex: '10',
    padding: `${px(8)} ${px(14)}`,
    borderRadius: px(12),
    background: colors.surfaceRaised,
    color: colors.textSoft,
    fontFamily: typography.family,
    fontSize: px(18),
  });
  root.appendChild(chip);
  return chip;
}

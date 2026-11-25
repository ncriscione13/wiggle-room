// Phase 0 start screen: the pastel face of the app until the real shell
// arrives in M1.10. All colors come from the theme (CLAUDE.md rule 9); motion
// is slow and eased, honoring prefers-reduced-motion (comfort rules).

import { colors, playerColors, px, typography } from '../ui/theme';

export function renderStartScreen(root: HTMLElement): void {
  document.body.style.background = colors.surfaceNight;

  const style = document.createElement('style');
  style.textContent = `
    .wr-start {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: ${px(18)};
      font-family: ${typography.family};
      color: ${colors.textSoft};
      text-align: center;
    }
    .wr-circles {
      display: flex;
      gap: ${px(48)};
      margin-bottom: ${px(12)};
    }
    .wr-circle {
      width: ${px(72)};
      height: ${px(72)};
      border-radius: 50%;
      animation: wr-float 2.6s ease-in-out infinite alternate;
    }
    .wr-circle[data-player='0'] {
      background: ${colors[playerColors[0]]};
    }
    .wr-circle[data-player='1'] {
      background: ${colors[playerColors[1]]};
      animation-delay: -1.3s;
    }
    .wr-title {
      margin: 0;
      font-size: ${px(typography.titlePx)};
      font-weight: 700;
      letter-spacing: ${px(2)};
    }
    .wr-subtitle {
      margin: 0;
      font-size: ${px(typography.subtitlePx)};
      color: ${colors.textDim};
    }
    .wr-hint {
      margin: ${px(24)} 0 0;
      font-size: ${px(typography.bodyPx)};
      color: ${colors.textDim};
      opacity: 0.85;
    }
    @media (prefers-reduced-motion: reduce) {
      .wr-circle {
        animation: none;
      }
    }
  `;
  document.head.appendChild(style);

  const main = document.createElement('main');
  main.className = 'wr-start';

  const circles = document.createElement('div');
  circles.className = 'wr-circles';
  for (const slot of ['0', '1']) {
    const circle = document.createElement('div');
    circle.className = 'wr-circle';
    circle.dataset['player'] = slot;
    circles.appendChild(circle);
  }

  const title = document.createElement('h1');
  title.className = 'wr-title';
  title.textContent = 'Wiggle Room';

  const subtitle = document.createElement('p');
  subtitle.className = 'wr-subtitle';
  subtitle.textContent = 'Move, jump and freeze — right in your living room.';

  const hint = document.createElement('p');
  hint.className = 'wr-hint';
  hint.textContent = 'No internet. No accounts. Nothing is recorded.';

  main.append(circles, title, subtitle, hint);
  root.replaceChildren(main);
}

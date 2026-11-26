// Phase 0 start screen: the pastel face of the app until the real shell
// arrives in M1.10. All colors come from the theme (CLAUDE.md rule 9); motion
// is slow and eased, honoring prefers-reduced-motion (comfort rules).

import { colors, cssRgba, playerColors, px, typography } from '../ui/theme';

export function renderStartScreen(root: HTMLElement): void {
  document.body.style.background = `radial-gradient(120% 90% at 50% 12%, ${colors.surfaceRaised} 0%, ${colors.surfaceNight} 55%, ${colors.surfaceDeep} 100%)`;

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
    @keyframes wr-float {
      from { transform: translateY(0); }
      to { transform: translateY(-14px); }
    }
    .wr-circle {
      position: relative;
      width: ${px(72)};
      height: ${px(72)};
      border-radius: 50%;
      animation: wr-float 2.6s ease-in-out infinite alternate;
      box-shadow: 0 10px 26px ${cssRgba(colors.surfaceDeep, 0.6)};
    }
    /* Little faces (eyes + smile): blobs with faces are buddies. */
    .wr-circle::before, .wr-circle::after {
      content: ''; position: absolute; top: 34%; width: 12%; height: 12%;
      border-radius: 50%; background: ${colors.surfaceDeep};
    }
    .wr-circle::before { left: 26%; }
    .wr-circle::after { right: 26%; }
    .wr-circle .wr-circle-smile {
      position: absolute; left: 32%; right: 32%; top: 48%; height: 22%;
      border: 3px solid ${colors.surfaceDeep}; border-top: none;
      border-left-color: transparent; border-right-color: transparent;
      border-radius: 0 0 100px 100px;
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
    const smile = document.createElement('div');
    smile.className = 'wr-circle-smile';
    circle.appendChild(smile);
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

  // The kid flow (M1.10). `/` itself keeps the debug stage until the M3
  // launcher; this is how families reach the game today.
  const play = document.createElement('a');
  play.className = 'wr-play';
  play.dataset['testid'] = 'play-button';
  play.href = '?play=1';
  play.textContent = "Let's play!";
  play.style.cssText = `
    display: inline-block; margin-top: 18px; padding: 18px 52px;
    border-radius: 999px; text-decoration: none; font-weight: 700;
    font-size: ${px(typography.subtitlePx)};
    color: ${colors.surfaceDeep};
    background: linear-gradient(180deg, ${colors.ice} 0%, ${colors.mint} 100%);
    box-shadow: 0 10px 28px ${cssRgba(colors.surfaceDeep, 0.55)}, inset 0 2px 0 ${cssRgba(colors.surfaceSnow, 0.55)};
  `;

  main.append(circles, title, subtitle, play, hint);
  root.replaceChildren(main);
}

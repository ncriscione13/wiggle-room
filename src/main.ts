import { renderStartScreen } from './shell/start-screen';
import { mountReplayBadge } from './shell/replay-badge';
import { sourceConfigFromUrl } from './tracking/source-config';

const app = document.querySelector<HTMLDivElement>('#app');
if (app !== null) {
  renderStartScreen(app);
  const config = sourceConfigFromUrl(window.location.search);
  if (config.source === 'replay') {
    void mountReplayBadge(app, config.clip);
  }
}

import { renderStartScreen } from './shell/start-screen';

const app = document.querySelector<HTMLDivElement>('#app');
if (app !== null) {
  renderStartScreen(app);
}

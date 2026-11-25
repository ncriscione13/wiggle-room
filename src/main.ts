import { bootApp } from './shell/app';

const app = document.querySelector<HTMLDivElement>('#app');
if (app !== null) {
  void bootApp(app);
}

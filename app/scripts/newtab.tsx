import { h, render } from 'preact';
import { NewTabPage } from './features/new_tab';
import '../styles/newtab.css';

const app = document.getElementById('app');
if (app) {
  render(<NewTabPage />, app);
}

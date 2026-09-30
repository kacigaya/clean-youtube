import * as youtube from '../lib/youtube';

window.youtube = youtube;

declare global {
  interface Window {
    youtube: typeof youtube;
  }
}

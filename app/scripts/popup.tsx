import { h, render } from 'preact';
import { useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import '../styles/popup.css';
import '../styles/content.css';
import '../styles/fallback.css';
import { SearchApp } from "./features/search_navigation/app";
import { themeStore, getTheme, applyRootTheme, DEFAULT_THEME_ID } from "./features/theme";

function Popup() {
  useEffect(() => {
    document.documentElement.classList.add('fallback-mode');
    document.body.classList.add('fallback-mode');

    themeStore.get().then((id) => applyRootTheme(getTheme(id ?? DEFAULT_THEME_ID)));

    const port = browser.runtime.connect({ name: "popupSearchMode" });

    const handleMessage = (msg: unknown) => {
      if ((msg as any)?.action === "closePopup") {
        window.close();
      }
    };

    browser.runtime.onMessage.addListener(handleMessage);

    return () => {
      port.disconnect();
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return <SearchApp onClose={() => window.close()} />;
}

const app = document.getElementById('app');
if (app) {
  render(<Popup />, app as Element);
}

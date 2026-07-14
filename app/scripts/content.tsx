import { h, render } from "preact";
import browser from "webextension-polyfill";
import { logger } from "./utils";
import { ExtensionMessage } from "./types";
import { SearchApp } from "./features/search_navigation/app";
import { themeStore, getTheme, buildContentThemeCSS, DEFAULT_THEME_ID } from "./features/theme";

// Guard against double-injection (manifest + one-time executeScript bootstrap).
if ((window as any).__tabaruContentLoaded) {
  // Already running — nothing to do.
} else {
(window as any).__tabaruContentLoaded = true;

const CONTAINER_SELECTOR = "div[data-tabaru-container]";

let overlayAbortController: AbortController | null = null;

function handleClose() {
  const container = document.querySelector(CONTAINER_SELECTOR);
  if (container) {
    overlayAbortController?.abort();
    overlayAbortController = null;
    container.remove();
  }
}

function globalKeyCaptureListener(e: KeyboardEvent) {
  const currentContainer = document.querySelector(CONTAINER_SELECTOR);
  if (!currentContainer) return;

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    handleClose();
    return;
  }

  const isFromContainer = e.composedPath().includes(currentContainer);
  if (!isFromContainer) {
    e.stopPropagation();
  }
}

async function openSearch() {
  if (document.querySelector(CONTAINER_SELECTOR)) return;

  overlayAbortController = new AbortController();
  const { signal } = overlayAbortController;

  const container = document.createElement("div");
  container.setAttribute("data-tabaru-container", "true");
  document.body.appendChild(container);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") handleClose();
  }, { signal });

  window.addEventListener("keydown", globalKeyCaptureListener, { capture: true, signal });
  window.addEventListener("keyup", globalKeyCaptureListener, { capture: true, signal });
  window.addEventListener("keypress", globalKeyCaptureListener, { capture: true, signal });

  const stopBubbling = (e: Event) => e.stopPropagation();
  container.addEventListener("keydown", stopBubbling, { signal });
  container.addEventListener("keyup", stopBubbling, { signal });
  container.addEventListener("keypress", stopBubbling, { signal });

  const shadowRoot = container.attachShadow({ mode: "open" });

  const cssUrl = browser.runtime.getURL("styles/content.css");
  try {
    const [response, savedThemeId] = await Promise.all([
      fetch(cssUrl),
      themeStore.get(),
    ]);
    const cssText = await response.text();
    const styleTag = document.createElement("style");
    styleTag.textContent = cssText;
    shadowRoot.appendChild(styleTag);

    const theme = getTheme(savedThemeId ?? DEFAULT_THEME_ID);
    const themeStyleTag = document.createElement("style");
    themeStyleTag.textContent = buildContentThemeCSS(theme.contentVars);
    shadowRoot.appendChild(themeStyleTag);
  } catch (err) {
    logger("Failed to load Tabaru CSS:", err);
  }

  const backdrop = document.createElement("div");
  backdrop.className = "tabaru-backdrop";
  backdrop.addEventListener("click", handleClose, { signal });
  shadowRoot.appendChild(backdrop);

  const contentContainer = document.createElement("div");
  shadowRoot.appendChild(contentContainer);

  render(<SearchApp onClose={handleClose} />, contentContainer);
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as ExtensionMessage;

  if (msg?.action === "openSearch") {
    openSearch();
    return Promise.resolve(true);
  }

  if (msg?.action === "closeSearchTab") {
    const isOpen = !!document.querySelector(CONTAINER_SELECTOR);
    handleClose();
    return Promise.resolve(isOpen);
  }

  return undefined;
});

} // end double-injection guard

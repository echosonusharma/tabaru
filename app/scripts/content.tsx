import { h, render } from "preact";
import browser from "webextension-polyfill";
import { Store, logger } from "./utils";
import { ExtensionMessage, StoreType } from "./types";
import { SearchApp } from "./features/search_navigation/app";
import { themeStore, getTheme, buildContentThemeCSS, DEFAULT_THEME_ID } from "./features/theme";

// IIFE prevents "already declared" errors on re-injection.
(async function () {
  const CONTAINER_SELECTOR = "div[data-tabaru-container]";
  const abortController = new AbortController();
  const { signal } = abortController;

  // Lifecycle Handlers

  function visibilityListener() {
    if (document.visibilityState !== "visible") {
      handleClose();
    }
  }

  function messageListener(message: unknown, _sender: browser.Runtime.MessageSender) {
    const msg = message as ExtensionMessage;
    if (msg?.action === "closeSearchTab") {
      handleClose();
      return Promise.resolve(true);
    }
  }

  function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
    const parts = shortcut.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const ctrl = parts.includes("ctrl") || parts.includes("macctrl");
    const alt = parts.includes("alt");
    const shift = parts.includes("shift");
    const meta = parts.includes("command") || parts.includes("meta");
    return (
      e.key.toLowerCase() === key &&
      e.ctrlKey === ctrl &&
      e.altKey === alt &&
      e.shiftKey === shift &&
      e.metaKey === meta
    );
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

    if (openAndCloseShortcut && e.type === "keydown" && matchesShortcut(e, openAndCloseShortcut)) {
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

  function handleClose() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (container) {
      browser.runtime.onMessage.removeListener(messageListener);
      abortController.abort();
      container.remove();
    }
  }

  // Entry Point

  const existingContainer = document.querySelector(CONTAINER_SELECTOR);
  if (existingContainer) {
    handleClose();
    return;
  }

  let openAndCloseShortcut: string | null = null;

  browser.runtime.onMessage.addListener(messageListener);
  document.addEventListener("visibilitychange", visibilityListener, { signal });
  window.addEventListener("keydown", globalKeyCaptureListener, { capture: true, signal });
  window.addEventListener("keyup", globalKeyCaptureListener, { capture: true, signal });
  window.addEventListener("keypress", globalKeyCaptureListener, { capture: true, signal });

  const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);
  const searchTabEnabled = (await searchTabStore.get()) as boolean;
  if (!searchTabEnabled) {
    return;
  }

  const container = document.createElement("div");
  container.setAttribute("data-tabaru-container", "true");
  // Append synchronously before any further awaits to prevent double-injection
  // from a second rapid shortcut press finding no existing container.
  document.body.appendChild(container);

  // Fetch lazily — listener reads openAndCloseShortcut at call time, so this resolves before any keypress
  browser.runtime.sendMessage({ action: "getOpenAndCloseShortcut" })
    .then((s) => { openAndCloseShortcut = (s as string | null); })
    .catch(() => {});

  // Prevent keyboard events originating from inside the container from bubbling out to the host document
  const stopBubbling = (e: Event) => e.stopPropagation();
  container.addEventListener("keydown", stopBubbling, { signal });
  container.addEventListener("keyup", stopBubbling, { signal });
  container.addEventListener("keypress", stopBubbling, { signal });

  const shadowRoot = container.attachShadow({ mode: "open" });

  // Load styles from external CSS file and wait for it
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

  // Add backdrop for click-outside-to-close
  const backdrop = document.createElement("div");
  backdrop.className = "tabaru-backdrop";
  backdrop.addEventListener("click", handleClose, { signal });
  shadowRoot.appendChild(backdrop);

  const contentContainer = document.createElement("div");
  shadowRoot.appendChild(contentContainer);

  render(<SearchApp onClose={handleClose} />, contentContainer);
})();

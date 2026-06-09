import { BookmarkItem, StoreType, TabData } from "../../types";
import { Store } from "../../utils";
import initWasmModule, { init_wasm } from "ld-wasm-lib";
import { logger } from "../../utils";

// --- WASM Initialization ---
export const wasmReadyPromise = initWasmModule()
  .then(() => { init_wasm("wasm module loaded successfully"); })
  .catch((e: Error) => logger(`Error in wasm module init:`, e));

// --- Constants ---
export const PATH_TO_CONTENT_SCRIPT: string = "scripts/content.js";
export const NO_OF_RECENT_TABS = 6;
export const BOOKMARK_RESULT_LIMIT = 50;

// --- Stores ---
export const tabsStore: Store<TabData> = new Store("tabs", StoreType.SESSION);
export const activeTabIdStore: Store<number> = new Store("activeTabId", StoreType.SESSION);
export const activeWindowIdStore: Store<number> = new Store("activeWindowId", StoreType.SESSION);
export const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);
export const commandHistoryStore: Store<Record<string, string[]>> = new Store("commandHistory", StoreType.LOCAL);
export const bookmarksStore: Store<BookmarkItem[]> = new Store("bookmarks", StoreType.LOCAL);
export { themeStore } from "../theme";

// --- State ---
export let searchPopupConnections = 0;

export function incrementSearchPopupConnections() { searchPopupConnections++; }
export function decrementSearchPopupConnections() { searchPopupConnections--; }

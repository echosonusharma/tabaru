import browser from "webextension-polyfill";
import { BookmarkItem, OpenTabInfo, SearchableTab, StoreType, TabData, TabInfo } from "../../types";
import { Store, getNewTabUrls, logger, looksLikeDomain } from "../../utils";
import initWasmModule, { init_wasm, generate_keyword_for_tab, ld } from "ld-wasm-lib";

// --- WASM Initialization ---
export const wasmReadyPromise = initWasmModule()
  .then(() => {
    init_wasm("wasm module loaded successfully");
  })
  .catch((e: Error) => console.debug(`Error in wasm module init:`, e));

// --- Constants ---
export const PATH_TO_CONTENT_SCRIPT: string = "scripts/content.js";
export const NO_OF_RECENT_TABS = 6;
export const BOOKMARK_RESULT_LIMIT = 50;
const NEW_TAB_URLS = getNewTabUrls();

// --- Stores ---
export const tabsStore: Store<TabData> = new Store("tabs", StoreType.SESSION);
export const activeTabIdStore: Store<number> = new Store("activeTabId", StoreType.SESSION);
export const activeWindowIdStore: Store<number> = new Store("activeWindowId", StoreType.SESSION);
export const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);
export const searchFallbackStore: Store<number> = new Store("searchFallback", StoreType.SESSION);
export const commandHistoryStore: Store<Record<string, string[]>> = new Store("commandHistory", StoreType.LOCAL);
export const bookmarksStore: Store<BookmarkItem[]> = new Store("bookmarks", StoreType.LOCAL);

// --- State ---
export let searchPopupConnections = 0;

export function incrementSearchPopupConnections() { searchPopupConnections++; }
export function decrementSearchPopupConnections() { searchPopupConnections--; }

// --- Tab & Window Management ---

export async function initWindowAndTabData(): Promise<void> {
  const currentWindow = await browser.windows.getCurrent({});

  if (currentWindow.id) {
    await activeWindowIdStore.set(currentWindow.id);
  }

  await updateTabStores();
}

export async function updateTabStores(tabQueryOptions: browser.Tabs.QueryQueryInfoType = {}): Promise<void> {
  try {
    const [queriedTabs, existingTabsData, activeTabs] = await Promise.all([
      browser.tabs.query(tabQueryOptions),
      tabsStore.get(),
      browser.tabs.query({ active: true, currentWindow: true }),
    ]);

    const activeTabId = activeTabs?.[0]?.id;
    if (activeTabId !== undefined) {
      await activeTabIdStore.set(activeTabId);
    }

    const tabsByWindowId = queriedTabs.reduce<TabData>((acc, tab) => {
      if (!tab.windowId || tab.id === undefined) {
        return acc;
      }

      if (!acc[tab.windowId]) {
        acc[tab.windowId] = [];
      }
      acc[tab.windowId].push(tab.id);

      return acc;
    }, {});

    if (existingTabsData) {
      const isQueryingAllTabs = Object.keys(tabQueryOptions).length === 0;

      if (isQueryingAllTabs) {
        await tabsStore.set(tabsByWindowId);
      } else {
        Object.assign(existingTabsData, tabsByWindowId);
        await tabsStore.set(existingTabsData);
      }
    } else {
      await tabsStore.set(tabsByWindowId);
    }
  } catch (error) {
    logger(`Error in updateTabStores:`, error);
  }
}

// --- Search Logic ---

export async function getAllSearchableTabs(): Promise<SearchableTab[]> {
  try {
    await wasmReadyPromise;
    const [allTabs, currentWindowId, recentTabs] = await Promise.all([
      browser.tabs.query({}) as Promise<TabInfo[]>,
      activeWindowIdStore.get(),
      getRecentlyClosedTabs(),
    ]);

    const openTabs = allTabs
      .filter(({ url = "" }) => !NEW_TAB_URLS.has(url))
      .map((tab) => ({
        ...tab,
        source: "open" as const,
        resultId: `open:${tab.id}`,
      })) as OpenTabInfo[];

    for (const tab of openTabs) {
      tab.keywords = generate_keyword_for_tab(tab.title, tab.url);
      tab.inCurrentWindow = tab.windowId === currentWindowId;
    }

    return [...openTabs, ...recentTabs];
  } catch (error) {
    logger("Failed to get all tabs:", error);
    return [];
  }
}

export async function getRecentlyClosedTabs(): Promise<SearchableTab[]> {
  if (!browser.sessions?.getRecentlyClosed) {
    return [];
  }

  try {
    const sessions = await browser.sessions.getRecentlyClosed({ maxResults: NO_OF_RECENT_TABS });
    const seenUrls = new Set<string>();

    return sessions
      .filter((session) => session.tab)
      .map((session) => {
        const recentTab = session.tab!;
        const sessionId = recentTab.sessionId;

        if (!sessionId) {
          return null;
        }

        return {
          source: "recent" as const,
          resultId: `recent:${sessionId}`,
          sessionId,
          title: recentTab.title,
          url: recentTab.url,
          favIconUrl: recentTab.favIconUrl,
          windowId: recentTab.windowId,
          keywords: generate_keyword_for_tab(recentTab.title, recentTab.url),
        };
      })
      .filter((tab): tab is Exclude<typeof tab, null> => tab !== null)
      .filter(({ url = "" }) => {
        if (seenUrls.has(url)) {
          return false;
        }
        seenUrls.add(url);

        return !NEW_TAB_URLS.has(url);
      });
  } catch (error) {
    logger("Failed to get recently closed tabs:", error);
    return [];
  }
}

export async function restoreRecentlyClosedSession(sessionId: string): Promise<boolean> {
  if (!browser.sessions?.restore) {
    return false;
  }

  try {
    await browser.sessions.restore(sessionId);
    return true;
  } catch (error) {
    logger("Failed to restore recently closed tab:", error);
    return false;
  }
}

interface RankableItem {
  title?: string;
  url?: string;
  keywords?: string[];
  fts?: number;
  ld?: number;
  matchIndex?: number;
}

export function orderItemsBySearchKeyword<T extends RankableItem>(searchKeyword: string, items: T[]): T[] {
  const sk = searchKeyword.toLowerCase();

  if (!sk) return items;

  for (const item of items) {
    const fullText = ((item.title || "") + " " + (item.url || "")).toLowerCase();
    const matchIndex = fullText.indexOf(sk);

    // 1. Check Full Substring Match First (FTS) against the whole title+url
    if (matchIndex !== -1) {
      item.fts = 1;
      item.ld = 0; // Skip WASM entirely! Zero distance is perfect.
      item.matchIndex = matchIndex;
      continue;
    }

    // 2. Fallback to Levenshtein against keywords
    const keywords = item.keywords ?? [];
    item.fts = 0;
    item.ld = keywords.length > 0 ? Math.min(...keywords.map((w) => ld(sk, w.toLowerCase()))) : Infinity;
    item.matchIndex = Infinity;
  }

  items.sort((a, b) => {
    const ftsA = a.fts ?? 0;
    const ftsB = b.fts ?? 0;

    // FTS matches always beat Levenshtein matches
    if (ftsA !== ftsB) {
      return ftsB - ftsA;
    }

    // If BOTH are FTS matches, rank by which match happens earlier in the string
    if (ftsA === 1 && ftsB === 1) {
      return (a.matchIndex ?? Infinity) - (b.matchIndex ?? Infinity);
    }

    // If NEITHER are FTS matches, rank by Levenshtein distance
    return (a.ld ?? Infinity) - (b.ld ?? Infinity);
  });

  return items;
}

export function orderTabsBySearchKeyword(searchKeyword: string, tabs: SearchableTab[]): SearchableTab[] {
  return orderItemsBySearchKeyword(searchKeyword, tabs);
}

export async function handleSearch(keyword: string): Promise<boolean> {
  if (looksLikeDomain(keyword)) {
    const url = keyword.startsWith("http") ? keyword : `https://${keyword}`;
    await browser.tabs.create({ url });
  } else {
    await browser.search.query({
      text: keyword,
      disposition: "NEW_TAB",
    });
  }
  return true;
}

// --- Command Logic ---

const MAX_COMMAND_HISTORY = 5;

export async function recordCommandHistory(commandKey: string, keyword: string): Promise<boolean> {
  const history = (await commandHistoryStore.get()) ?? {};
  const existing = history[commandKey] ?? [];
  history[commandKey] = [keyword, ...existing.filter((k) => k !== keyword)].slice(0, MAX_COMMAND_HISTORY);
  return commandHistoryStore.set(history);
}

export async function getCommandHistory(commandKey: string): Promise<string[]> {
  const history = (await commandHistoryStore.get()) ?? {};
  return history[commandKey] ?? [];
}

export async function handleExecuteCommand(commandKey: string, keyword: string): Promise<boolean> {
  try {
    switch (commandKey) {
      case "s": {
        return await handleSearch(keyword);
      }
      default:
        logger(`Unknown command key: ${commandKey}`);
        return false;
    }
  } catch (error) {
    logger(`Error executing command '${commandKey}':`, error);
    return false;
  }
}

export async function handleSearchCmd(activeTabId: number, activeWindowId: number): Promise<void> {
  if (searchPopupConnections > 0) {
    return;
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId: activeTabId },
      files: [PATH_TO_CONTENT_SCRIPT],
    });
  } catch (error) {
    logger(`Error in handleSearchCmd, falling back to popup:`, error);
    try {
      await searchFallbackStore.set(Date.now());
      await browser.action.setPopup({ popup: "popup.html" });
      await browser.action.openPopup({ windowId: activeWindowId });
    } catch (fallbackError) {
      logger(`Failed to open fallback popup:`, fallbackError);
      await browser.action.setPopup({ popup: "" });
    }
  }
}

// --- Bookmarks Logic ---

export function deriveFaviconUrlForBookmark(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return undefined;
    return `${browser.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=32`;
  } catch {
    return undefined;
  }
}

const dirTitleCache = new Map<string, string>();

export async function getDirTitle(parentId: string | undefined): Promise<string | undefined> {
  if (!parentId) return undefined;
  const cached = dirTitleCache.get(parentId);
  if (cached !== undefined) return cached;
  try {
    const nodes = await browser.bookmarks.get(parentId);
    const title = nodes[0]?.title || "";
    dirTitleCache.set(parentId, title);
    return title;
  } catch {
    return undefined;
  }
}

export async function populateDirTitleCacheFromTree(): Promise<void> {
  try {
    const tree = await browser.bookmarks.getTree();
    const walk = (nodes: browser.Bookmarks.BookmarkTreeNode[]): void => {
      for (const node of nodes) {
        if (!node.url && node.id) {
          dirTitleCache.set(node.id, node.title || "");
        }
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
  } catch {
  }
}

export async function rebuildBookmarksIndex(): Promise<void> {
  try {
    await wasmReadyPromise;
    const tree = await browser.bookmarks.getTree();
    const items: BookmarkItem[] = [];
    dirTitleCache.clear();

    const walk = (nodes: browser.Bookmarks.BookmarkTreeNode[], parentTitle?: string): void => {
      for (const node of nodes) {
        if (node.url) {
          items.push({
            id: node.id,
            title: node.title || "",
            url: node.url,
            favIconUrl: deriveFaviconUrlForBookmark(node.url),
            keywords: generate_keyword_for_tab(node.title || "", node.url),
            parentId: node.parentId,
            parentTitle,
            dateAdded: node.dateAdded,
          });
        } else if (node.id) {
          dirTitleCache.set(node.id, node.title || "");
        }
        if (node.children) walk(node.children, node.url ? parentTitle : (node.title || parentTitle));
      }
    };

    walk(tree);
    await bookmarksStore.set(items);
  } catch (error) {
    logger("Failed to rebuild bookmarks index:", error);
  }
}

export async function searchBookmarks(searchKeyword: string): Promise<BookmarkItem[]> {
  const sk = searchKeyword.toLowerCase();
  if (!sk) return [];
  const items = (await bookmarksStore.get()) ?? [];
  return orderItemsBySearchKeyword(sk, items).slice(0, BOOKMARK_RESULT_LIMIT);
}

export async function handleOpenBookmark(url: string): Promise<boolean> {
  await browser.tabs.create({ url });
  return true;
}

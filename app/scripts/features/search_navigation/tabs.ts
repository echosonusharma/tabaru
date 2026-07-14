import browser from "webextension-polyfill";
import { OpenTabInfo, SearchableTab, TabData, TabInfo } from "../../types";
import { getNewTabUrls, logger, looksLikeDomain } from "../../utils";
import { generate_keyword_for_tab } from "ld-wasm-lib";
export { orderItemsBySearchKeyword, orderTabsBySearchKeyword } from "./ranking";
import {
  activeTabIdStore,
  activeWindowIdStore,
  NO_OF_RECENT_TABS,
  searchPopupConnections,
  searchTabStore,
  tabsStore,
  wasmReadyPromise,
} from "./stores";

const NEW_TAB_URLS = getNewTabUrls();

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


export async function handleSearch(keyword: string): Promise<boolean> {
  if (looksLikeDomain(keyword)) {
    const url = keyword.startsWith("http") ? keyword : `https://${keyword}`;
    await browser.tabs.create({ url });
  } else {
    const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");
    if (isFirefox) {
      const tab = await browser.tabs.create({});
      if (tab.id !== undefined) {
        await browser.search.query({ text: keyword, tabId: tab.id });
      }
    } else {
      await browser.search.query({ text: keyword, disposition: "NEW_TAB" });
    }
  }
  return true;
}

async function openPopupFallback(_activeWindowId: number): Promise<void> {
  try {
    await browser.action.setPopup({ popup: "popup.html" });
    await browser.action.openPopup();
  } catch (fallbackError) {
    logger(`Failed to open fallback popup:`, fallbackError);
    await browser.action.setPopup({ popup: "" });
  }
}

export async function handleSearchCmd(activeTabId: number, activeWindowId: number): Promise<void> {
  if (searchPopupConnections > 0) {
    // commands.onCommand only fires in service worker (MV3), not popup - relay close via message
    try {
      await browser.runtime.sendMessage({ action: "closePopup" });
    } catch {}
    return;
  }

  const searchTabEnabled = await searchTabStore.get();

  if (!searchTabEnabled) {
    await openPopupFallback(activeWindowId);
    return;
  }

  // Try to close if already open. Throws when content script not present on tab
  // (pre-existing tab before extension reload — manifest only injects into new tabs).
  let closed: unknown;
  try {
    closed = await browser.tabs.sendMessage(activeTabId, { action: "closeSearchTab" });
  } catch {
    // No content script — bootstrap via executeScript, then open.
    try {
      await browser.scripting.executeScript({
        target: { tabId: activeTabId },
        files: ["scripts/content.js"],
      });
      await browser.tabs.sendMessage(activeTabId, { action: "openSearch" });
    } catch (error) {
      logger(`Error in handleSearchCmd, falling back to popup:`, error);
      await openPopupFallback(activeWindowId);
    }
    return;
  }

  if (!closed) {
    try {
      await browser.tabs.sendMessage(activeTabId, { action: "openSearch" });
    } catch (error) {
      logger(`Error in handleSearchCmd, falling back to popup:`, error);
      await openPopupFallback(activeWindowId);
    }
  }
}

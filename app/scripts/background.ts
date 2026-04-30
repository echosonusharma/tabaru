import browser from "webextension-polyfill";
import { ExtensionMessage, TabData } from "./types";
import { logger, openSettingsPage } from "./utils";
import { handleFetchFavicon } from "./favicon";
import { checkAndPromptShortcuts } from "./features/shortcuts";
import { applyTabGroupRules, applyTabGroupRulesToAllTabs, groupTabsForRuleNow } from "./features/auto_tab_group";
import {
  initWindowAndTabData,
  rebuildBookmarksIndex,
  searchTabStore,
  activeWindowIdStore,
  restoreRecentlyClosedSession,
  getAllSearchableTabs,
  wasmReadyPromise,
  orderTabsBySearchKeyword,
  handleExecuteCommand,
  recordCommandHistory,
  getCommandHistory,
  searchBookmarks,
  handleOpenBookmark,
  activeTabIdStore,
  tabsStore,
  updateTabStores,
  incrementSearchPopupConnections,
  decrementSearchPopupConnections,
  handleSearchCmd,
  getDirTitle,
  bookmarksStore
} from "./features/search_navigation";

// Runtime Events

browser.runtime.onConnect.addListener((port) => {
  if (port.name === "popupSearchMode") {
    incrementSearchPopupConnections();
    port.onDisconnect.addListener(async () => {
      decrementSearchPopupConnections();
      try {
        await browser.action.setPopup({ popup: "" });
      } catch (e) {
        logger("Error clearing popup:", e);
      }
    });
  }
});

browser.action.onClicked.addListener(async () => {
  await openSettingsPage();
});

browser.runtime.onStartup.addListener(async () => {
  await initWindowAndTabData();
  await rebuildBookmarksIndex();
  await applyTabGroupRulesToAllTabs();
});

browser.runtime.onInstalled.addListener(async (details) => {
  await initWindowAndTabData();
  await searchTabStore.set(true);
  await rebuildBookmarksIndex();
  await applyTabGroupRulesToAllTabs();

  if (details.reason === "install") {
    checkAndPromptShortcuts();
  }
});

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local" || !changes.tabGroupRules) {
    return;
  }

  await applyTabGroupRulesToAllTabs();
});

browser.runtime.onMessage.addListener(
  async (message: unknown, _sender: browser.Runtime.MessageSender): Promise<any> => {
    const msg = message as ExtensionMessage;

    switch (msg?.action) {
      case "getCurrentWindowId":
        return (await activeWindowIdStore.get()) as number;

      case "switchToTab":
        if (msg.data.windowId) {
          await browser.windows.update(msg.data.windowId, { focused: true });
        }
        await browser.tabs.update(msg.data.tabId, { active: true });
        return true;

      case "restoreRecentlyClosed":
        return await restoreRecentlyClosedSession(msg.data.sessionId);

      case "getAllTabs":
        return await getAllSearchableTabs();

      case "orderTabsBySearchKeyword":
        await wasmReadyPromise;
        return orderTabsBySearchKeyword(msg.data.searchKeyword, msg.data.tabs);

      case "fetchFavicon":
        return await handleFetchFavicon(msg.data.iconUrl);

      case "executeCommand":
        return await handleExecuteCommand(msg.data.commandKey, msg.data.keyword);

      case "recordCommand":
        return await recordCommandHistory(msg.data.commandKey, msg.data.keyword);

      case "getRecentCommands":
        return await getCommandHistory(msg.data.commandKey);

      case "searchBookmarks":
        await wasmReadyPromise;
        return await searchBookmarks(msg.data.searchKeyword);

      case "openBookmark":
        return await handleOpenBookmark(msg.data.url);

      case "groupTabsByRule":
        return await groupTabsForRuleNow(msg.data.ruleId);

      default:
        return undefined;
    }
  }
);

// Window Events

browser.windows.onFocusChanged.addListener(async (windowId: number) => {
  const previousWindowId = (await activeWindowIdStore.get()) as number;

  if (windowId !== browser.windows.WINDOW_ID_NONE) {
    await activeWindowIdStore.set(windowId);
  }

  if (previousWindowId && previousWindowId !== windowId && previousWindowId !== browser.windows.WINDOW_ID_NONE) {
    try {
      const prevActiveTabs = await browser.tabs.query({ active: true, windowId: previousWindowId });
      if (prevActiveTabs[0]?.id !== undefined) {
        await browser.tabs.sendMessage(prevActiveTabs[0].id, { action: "closeSearchTab" });
      }
    } catch {
    }
  }
});

browser.windows.onRemoved.addListener(async (windowId: number) => {
  try {
    const tabsData = await tabsStore.get();
    if (tabsData?.[windowId]) {
      delete tabsData[windowId];
      await tabsStore.set(tabsData);
    }
  } catch (error) {
    logger(`Error in windows onRemoved:`, error);
  }
});

browser.windows.onCreated.addListener(async (window: browser.Windows.Window) => {
  try {
    if (window.id && window.id !== browser.windows.WINDOW_ID_NONE) {
      await activeWindowIdStore.set(window.id);
      await updateTabStores({ windowId: window.id });
    }
  } catch (error) {
    logger(`Error in windows onCreated:`, error);
  }
});

// Tab Events

browser.idle.onStateChanged.addListener(async (newState: browser.Idle.IdleState) => {
  if (newState === "active") {
    await initWindowAndTabData();
  }
});

browser.tabs.onCreated.addListener(async (tab: browser.Tabs.Tab) => {
  try {
    if (!tab.windowId || !tab.id) {
      return;
    }

    const tabsData = (await tabsStore.get()) as TabData;

    if (!tabsData[tab.windowId]) {
      tabsData[tab.windowId] = [];
    }

    tabsData[tab.windowId].splice(tab.index, 0, tab.id);
    await tabsStore.set(tabsData);

    if (tab.url) {
      await applyTabGroupRules(tab);
    }
  } catch (error) {
    logger(`Error in onCreated tab:`, error);
  }
});

browser.tabs.onMoved.addListener(async (tabId: number, moveInfo: browser.Tabs.OnMovedMoveInfoType) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;
    const windowTabIds = tabsData[moveInfo.windowId];

    if (!windowTabIds) return;

    const tabIndex = windowTabIds.findIndex((id) => id === tabId);
    if (tabIndex === -1) return;

    const [movedTabId] = windowTabIds.splice(tabIndex, 1);
    windowTabIds.splice(moveInfo.toIndex, 0, movedTabId);

    await tabsStore.set(tabsData);
  } catch (error) {
    logger(`Error in onMoved tab:`, error);
  }
});

browser.tabs.onRemoved.addListener(async (tabId: number, removeInfo: browser.Tabs.OnRemovedRemoveInfoType) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;

    if (tabsData[removeInfo.windowId]) {
      tabsData[removeInfo.windowId] = tabsData[removeInfo.windowId].filter((id) => id !== tabId);
      await tabsStore.set(tabsData);
    }
  } catch (error) {
    logger(`Error in onRemoved tab:`, error);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo: browser.Tabs.OnActivatedActiveInfoType) => {
  const previousTabId = (await activeTabIdStore.get()) as number;

  await activeTabIdStore.set(activeInfo.tabId);

  if (previousTabId && previousTabId !== activeInfo.tabId) {
    try {
      await browser.tabs.sendMessage(previousTabId, { action: "closeSearchTab" });
    } catch {
    }
  }
});

browser.tabs.onUpdated.addListener(async (tabId: number, changeInfo: browser.Tabs.OnUpdatedChangeInfoType, tab: browser.Tabs.Tab) => {
  if (changeInfo.url) {
    await applyTabGroupRules(tab);
  }
});

// Command Handler

browser.commands.onCommand.addListener(async (command: string) => {
  try {
    const activeTabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTabs || activeTabs.length === 0) return;

    const activeTabId = activeTabs[0].id;
    const activeWindowId = activeTabs[0].windowId;

    if (!activeTabId || !activeWindowId) {
      return;
    }

    const tabIdsData = (await tabsStore.get()) as TabData;

    switch (command) {
      case "next_tab":
      case "prev_tab":
        await handleTabMoveCmd(tabIdsData, command === "next_tab" ? 1 : -1, activeTabId, activeWindowId);
        break;
      case "next_win":
      case "prev_win":
        await handleWindowMoveCmd(tabIdsData, command === "next_win" ? 1 : -1, activeWindowId);
        break;
      case "open_and_close_search":
        await handleSearchCmd(activeTabId, activeWindowId);
        break;
      case "kill_tab":
        await browser.tabs.remove(activeTabId);
        break;
    }
  } catch (err) {
    logger("Error handling command:", err);
  }
});

// Command Handlers

async function handleTabMoveCmd(
  tabIdsData: TabData,
  direction: 1 | -1,
  activeTabId: number,
  activeWindowId: number
): Promise<void> {
  try {
    const windowTabIds = tabIdsData[activeWindowId];

    if (!windowTabIds || windowTabIds.length <= 1) {
      return;
    }

    const currentTabIndex = windowTabIds.findIndex((id) => id === activeTabId);
    if (currentTabIndex === -1) {
      return;
    }

    const newIndex = (currentTabIndex + direction + windowTabIds.length) % windowTabIds.length;

    await browser.tabs.update(windowTabIds[newIndex], { active: true });
  } catch (error) {
    logger(`Error in handleTabMoveCmd:`, error);
  }
}

async function handleWindowMoveCmd(
  tabIdsData: TabData,
  direction: 1 | -1,
  activeWindowId: number
): Promise<void> {
  try {
    const windowIds = Object.keys(tabIdsData);
    if (windowIds.length <= 1) {
      return;
    }

    const currentWindowIndex = windowIds.findIndex((wId) => Number(wId) === activeWindowId);
    if (currentWindowIndex === -1) {
      return;
    }

    const newIndex = (currentWindowIndex + direction + windowIds.length) % windowIds.length;

    await browser.windows.update(Number(windowIds[newIndex]), { focused: true });
  } catch (error) {
    logger(`Error in handleWindowMoveCmd:`, error);
  }
}

// Bookmarks Listeners

browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
  try {
    if (!bookmark.url) {
      return;
    }
    await wasmReadyPromise;
    const items = (await bookmarksStore.get()) ?? [];
    items.push({
      id,
      title: bookmark.title || "",
      url: bookmark.url,
      favIconUrl: `${browser.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(bookmark.url)}&size=32`,
      keywords: [], // Rebuild logic might be better but this is fine for now
      parentId: bookmark.parentId,
      parentTitle: await getDirTitle(bookmark.parentId),
      dateAdded: bookmark.dateAdded,
    });
    // Actually, it's better to just rebuild the whole index or update the specific item correctly
    await rebuildBookmarksIndex();
  } catch (error) {
    logger("Error in bookmarks.onCreated:", error);
  }
});

browser.bookmarks.onRemoved.addListener(async () => {
  await rebuildBookmarksIndex();
});

browser.bookmarks.onChanged.addListener(async () => {
  await rebuildBookmarksIndex();
});

browser.bookmarks.onMoved.addListener(async () => {
  await rebuildBookmarksIndex();
});

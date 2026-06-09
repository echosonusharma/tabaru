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
} from "./features/search_navigation";

// Serializes all tabsStore read-modify-write operations so concurrent tab events
// (e.g. many tabs restored at startup) never race and corrupt the tab ID array.
let _tabStoreOpQueue: Promise<void> = Promise.resolve();
function withTabStoreLock(fn: () => Promise<void>): void {
  _tabStoreOpQueue = _tabStoreOpQueue.catch(() => {}).then(fn);
}

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

      case "getOpenAndCloseShortcut": {
        const cmds = await browser.commands.getAll();
        const cmd = cmds.find((c) => c.name === "open_and_close_search");
        return cmd?.shortcut ?? null;
      }

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
      // expected: tab may not have content script loaded
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

browser.tabs.onCreated.addListener((tab: browser.Tabs.Tab) => {
  if (!tab.windowId || !tab.id) return;
  withTabStoreLock(async () => {
    try {
      const tabsData: TabData = (await tabsStore.get()) ?? {};
      if (!tabsData[tab.windowId!]) tabsData[tab.windowId!] = [];
      tabsData[tab.windowId!].splice(tab.index, 0, tab.id!);
      await tabsStore.set(tabsData);
    } catch (error) {
      logger(`Error in onCreated tab:`, error);
    }
  });
  if (tab.url) applyTabGroupRules(tab).catch((e) => logger("Error applying tab group rules on create:", e));
});

browser.tabs.onMoved.addListener((tabId: number, moveInfo: browser.Tabs.OnMovedMoveInfoType) => {
  withTabStoreLock(async () => {
    try {
      const tabsData: TabData = (await tabsStore.get()) ?? {};
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
});

browser.tabs.onRemoved.addListener((tabId: number, removeInfo: browser.Tabs.OnRemovedRemoveInfoType) => {
  withTabStoreLock(async () => {
    try {
      const tabsData: TabData = (await tabsStore.get()) ?? {};
      if (tabsData[removeInfo.windowId]) {
        tabsData[removeInfo.windowId] = tabsData[removeInfo.windowId].filter((id) => id !== tabId);
        await tabsStore.set(tabsData);
      }
    } catch (error) {
      logger(`Error in onRemoved tab:`, error);
    }
  });
});

browser.tabs.onActivated.addListener(async (activeInfo: browser.Tabs.OnActivatedActiveInfoType) => {
  const previousTabId = (await activeTabIdStore.get()) as number;

  await activeTabIdStore.set(activeInfo.tabId);

  if (previousTabId && previousTabId !== activeInfo.tabId) {
    try {
      await browser.tabs.sendMessage(previousTabId, { action: "closeSearchTab" });
    } catch {
      // expected: tab may not have content script loaded
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
    let windowTabIds = tabIdsData[activeWindowId];
    let currentTabIndex = windowTabIds?.findIndex((id) => id === activeTabId) ?? -1;

    if (currentTabIndex === -1) {
      // Store is stale — rebuild from live browser state and retry
      const realTabs = await browser.tabs.query({ windowId: activeWindowId });
      realTabs.sort((a, b) => a.index - b.index);
      windowTabIds = realTabs.map((t) => t.id!).filter((id) => id !== undefined);
      currentTabIndex = windowTabIds.findIndex((id) => id === activeTabId);
      if (currentTabIndex === -1) return;
      // Repair the store while we're here
      withTabStoreLock(async () => {
        const fresh: TabData = (await tabsStore.get()) ?? {};
        fresh[activeWindowId] = windowTabIds!;
        await tabsStore.set(fresh);
      });
    }

    if (windowTabIds.length <= 1) return;

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

browser.bookmarks.onCreated.addListener(async () => {
  await rebuildBookmarksIndex();
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

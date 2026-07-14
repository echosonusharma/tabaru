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
  listSavedSessionNames,
  deleteSavedSession,
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

      case "listSavedSessions":
        return await listSavedSessionNames();

      case "deleteSavedSession":
        return await deleteSavedSession(msg.data.name);

      case "fetchWeather": {
        try {
          return await handleFetchWeather(msg.data.provider, msg.data.city, msg.data.unit);
        } catch (e) {
          logger('fetchWeather failed:', e);
          return { error: String(e) };
        }
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
      case "move_tab_left":
      case "move_tab_right":
        await handleMoveTabCmd(command === "move_tab_right" ? 1 : -1, activeTabId, activeWindowId);
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
      // Store is stale - rebuild from live browser state and retry
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

async function handleMoveTabCmd(direction: 1 | -1, activeTabId: number, activeWindowId: number): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ windowId: activeWindowId });
    tabs.sort((a, b) => a.index - b.index);
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || activeTab.pinned) return;

    const pinnedCount = tabs.filter((t) => t.pinned).length;
    const rangeSize = tabs.length - pinnedCount;
    if (rangeSize <= 1) return;

    const positionInRange = activeTab.index - pinnedCount;
    const newPositionInRange = (positionInRange + direction + rangeSize) % rangeSize;
    await browser.tabs.move(activeTabId, { index: pinnedCount + newPositionInRange });
  } catch (error) {
    logger(`Error in handleMoveTabCmd:`, error);
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

// ─── Weather proxy (background bypasses CORS) ────────────────────────────────

const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// wttr.in uses its own code set; map to WMO equivalents used by open-meteo.
function wttrCodeToWmo(code: number): number {
  const map: Record<number, number> = {
    113: 0,   // Sunny/Clear
    116: 2,   // Partly cloudy
    119: 3,   // Cloudy
    122: 3,   // Overcast
    143: 45,  // Mist
    176: 80,  // Patchy rain
    179: 85,  // Patchy snow
    182: 68,  // Patchy sleet
    185: 66,  // Patchy freezing drizzle
    200: 95,  // Thundery outbreaks
    227: 71,  // Blowing snow
    230: 75,  // Blizzard
    248: 45,  // Fog
    260: 48,  // Freezing fog
    263: 51,  // Light drizzle
    266: 53,  // Moderate drizzle
    281: 56,  // Freezing drizzle
    284: 57,  // Heavy freezing drizzle
    293: 61,  // Patchy light rain
    296: 61,  // Light rain
    299: 63,  // Moderate rain
    302: 65,  // Heavy rain
    305: 63,  // Heavy rain at times
    308: 65,  // Torrential rain
    311: 68,  // Light sleet
    314: 67,  // Heavy sleet
    317: 68,  // Light sleet showers
    320: 67,  // Heavy sleet showers
    323: 71,  // Patchy light snow
    326: 71,  // Light snow
    329: 73,  // Patchy moderate snow
    332: 73,  // Moderate snow
    335: 75,  // Patchy heavy snow
    338: 75,  // Heavy snow
    350: 77,  // Ice pellets
    353: 80,  // Light rain shower
    356: 81,  // Moderate/heavy rain shower
    359: 82,  // Torrential rain shower
    362: 68,  // Light sleet shower
    365: 67,  // Heavy sleet shower
    368: 85,  // Light snow shower
    371: 86,  // Heavy snow shower
    374: 77,  // Light ice pellet shower
    377: 77,  // Heavy ice pellet shower
    386: 95,  // Light rain with thunder
    389: 95,  // Heavy rain with thunder
    392: 95,  // Light snow with thunder
    395: 99,  // Heavy snow with thunder
  };
  return map[code] ?? 0;
}

async function handleFetchWeather(
  provider: 'open-meteo' | 'wttr',
  city: string,
  unit: 'C' | 'F',
): Promise<unknown> {
  const cacheKey = `weather_cache:${provider}:${city.trim().toLowerCase()}:${unit}`;
  const stored = await browser.storage.local.get(cacheKey);
  const cached = stored[cacheKey] as { data: unknown; ts: number } | undefined;
  if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL) {
    return cached.data;
  }

  if (provider === 'wttr') {
    const url = city.trim()
      ? `https://wttr.in/${encodeURIComponent(city.trim())}?format=j1`
      : `https://wttr.in/?format=j1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`wttr fetch failed: ${res.status}`);
    const data = await res.json();
    const cond = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    if (!cond || !area) throw new Error('bad wttr response');
    const result = {
      city: area.areaName?.[0]?.value ?? city,
      temp: Number(unit === 'F' ? cond.temp_F : cond.temp_C),
      feelsLike: Number(unit === 'F' ? cond.FeelsLikeF : cond.FeelsLikeC),
      humidity: Number(cond.humidity),
      weatherCode: wttrCodeToWmo(Number(cond.weatherCode)),
    };
    await browser.storage.local.set({ [cacheKey]: { data: result, ts: Date.now() } });
    return result;
  }

  // Open-Meteo
  let lat: number, lon: number, cityName: string;
  if (city.trim()) {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=en&format=json`
    );
    if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`);
    const geoData = await geoRes.json();
    const r = geoData.results?.[0];
    if (!r) throw new Error('City not found');
    lat = r.latitude; lon = r.longitude; cityName = r.name;
  } else {
    const ipRes = await fetch('https://ipinfo.io/json');
    if (!ipRes.ok) throw new Error(`IP geolocation failed: ${ipRes.status}`);
    const ipData = await ipRes.json();
    if (!ipData.loc) throw new Error('IP geolocation missing loc');
    [lat, lon] = ipData.loc.split(',').map(Number);
    cityName = ipData.city ?? 'Unknown';
  }
  const unitParam = unit === 'F' ? 'fahrenheit' : 'celsius';
  const wRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&temperature_unit=${unitParam}`
  );
  if (!wRes.ok) throw new Error(`Weather fetch failed: ${wRes.status}`);
  const wData = await wRes.json();
  const c = wData.current;
  const result = {
    city: cityName,
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    weatherCode: c.weather_code,
  };
  await browser.storage.local.set({ [cacheKey]: { data: result, ts: Date.now() } });
  return result;
}

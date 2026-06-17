import { h, Fragment } from "preact";
import type * as preact from "preact";
import { memo } from "preact/compat";
import browser from "webextension-polyfill";
import { useEffect, useState, useRef, useMemo } from "preact/hooks";
import { broadcastMsgToServiceWorker, looksLikeDomain } from "../../utils";
import { SearchableTab, BookmarkItem } from "../../types";
import { SearchIcon, CommandIcon, HistoryIcon, WindowIcon } from "../../icons";
import { CommandMeta } from "./commands/types";
import { COMMANDS, COMMAND_MAP } from "./commands/registry";

const COMMAND_PREFIX = "!";

/**
 * Parse the search query into an active command and its keyword.
 * Activation rules:
 *   - Keyword commands (`!s foo`): trailing space required after key.
 *   - No-keyword commands (`!dup`): activate on exact match, no space needed.
 */
function parseActiveCommand(query: string): { command: CommandMeta; keyword: string } | null {
  if (!query.startsWith(COMMAND_PREFIX)) return null;
  const rest = query.slice(COMMAND_PREFIX.length);
  const spaceIdx = rest.indexOf(" ");

  if (spaceIdx < 0) {
    const cmd = COMMAND_MAP.get(rest);
    if (cmd && cmd.requiresKeyword === false) {
      return { command: cmd, keyword: "" };
    }
    return null;
  }

  const key = rest.slice(0, spaceIdx);
  const cmd = COMMAND_MAP.get(key);
  if (!cmd) return null;
  const keyword = cmd.requiresKeyword === false ? "" : rest.slice(spaceIdx + 1);
  return { command: cmd, keyword };
}

/** Clamp input to `!key` for no-keyword commands — block any text past the key. */
function clampQuery(raw: string): string {
  if (!raw.startsWith(COMMAND_PREFIX)) return raw;
  const rest = raw.slice(COMMAND_PREFIX.length);
  const spaceIdx = rest.indexOf(" ");
  const key = spaceIdx < 0 ? rest : rest.slice(0, spaceIdx);
  const cmd = COMMAND_MAP.get(key);
  if (cmd && cmd.requiresKeyword === false) {
    return `${COMMAND_PREFIX}${key}`;
  }
  return raw;
}

function dispatchExecuteCommand(commandKey: string, keyword: string) {
  broadcastMsgToServiceWorker({
    action: "executeCommand",
    data: { commandKey, keyword },
  }).catch(console.error);
}

const faviconCache = new Map<string, string>();
const faviconInFlight = new Map<string, Promise<string>>();

async function getFavicon(iconUrl: string | undefined): Promise<string> {
  if (!iconUrl || iconUrl.startsWith("data:")) return iconUrl || "";
  const cached = faviconCache.get(iconUrl);
  if (cached !== undefined) return cached;
  const pending = faviconInFlight.get(iconUrl);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const result = await broadcastMsgToServiceWorker({
        action: "fetchFavicon",
        data: { iconUrl }
      });
      const resolved = (result as string) || iconUrl;
      faviconCache.set(iconUrl, resolved);
      return resolved;
    } catch {
      faviconCache.set(iconUrl, iconUrl);
      return iconUrl;
    } finally {
      faviconInFlight.delete(iconUrl);
    }
  })();
  faviconInFlight.set(iconUrl, promise);
  return promise;
}

function extractDomain(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function FaviconImg({ favIconUrl, className = "tab-favicon" }: { favIconUrl?: string; className?: string }) {
  const fallbackIconUrl = browser.runtime.getURL("images/tabaru-icon.svg");
  const cachedIcon = favIconUrl ? faviconCache.get(favIconUrl) : undefined;
  const [iconUrl, setIconUrl] = useState(cachedIcon ?? fallbackIconUrl);

  useEffect(() => {
    if (!favIconUrl) {
      setIconUrl(fallbackIconUrl);
      return;
    }
    const cached = faviconCache.get(favIconUrl);
    if (cached !== undefined) {
      setIconUrl(cached);
      return;
    }
    let cancelled = false;
    getFavicon(favIconUrl).then((url) => {
      if (!cancelled && url) setIconUrl(url);
    });
    return () => { cancelled = true; };
  }, [favIconUrl]);

  return (
    <img
      src={iconUrl}
      onError={() => iconUrl !== fallbackIconUrl && setIconUrl(fallbackIconUrl)}
      alt=""
      className={className}
    />
  );
}

const TabComponent = memo(function TabComponent({ tab }: { tab: SearchableTab }) {
  const isRecentlyClosed = tab.source === "recent";

  return (
    <Fragment>
      <FaviconImg favIconUrl={tab.favIconUrl} />
      <div className="tab-info">
        <span className="tab-title">{tab.title}</span>
        <span className="tab-url">{extractDomain(tab.url)}</span>
      </div>
      {isRecentlyClosed && (
        <div className="history-badge" title="Recently closed tab">
          <HistoryIcon />
          <span>Recently Closed</span>
        </div>
      )}
      {tab.source === "open" && !tab.inCurrentWindow && (
        <div className="window-badge" title="In another window">
          <WindowIcon />
          <span>Other Window</span>
        </div>
      )}
    </Fragment>
  );
});


type HintMode = "bookmark" | "command" | "action" | "suggest" | "normal";

function KeyboardHints({ mode }: { mode: HintMode }) {
  return (
    <div className="keyboard-hint">
      {mode === "bookmark" && (
        <Fragment>
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </Fragment>
      )}
      {mode === "command" && (
        <Fragment>
          <span><kbd>↑</kbd> <kbd>↓</kbd> history</span>
          <span><kbd>↵</kbd> execute</span>
          <span><kbd>esc</kbd> close</span>
        </Fragment>
      )}
      {mode === "action" && (
        <Fragment>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </Fragment>
      )}
      {mode === "suggest" && (
        <Fragment>
          <span><kbd>↑</kbd> <kbd>↓</kbd> pick command</span>
          <span><kbd>space</kbd> or <kbd>↵</kbd> select</span>
        </Fragment>
      )}
      {mode === "normal" && (
        <Fragment>
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span><kbd>!</kbd> commands</span>
        </Fragment>
      )}
    </div>
  );
}

function useSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [tabs, setTabs] = useState<SearchableTab[]>([]);
  const [filteredTabs, setFilteredTabs] = useState<SearchableTab[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [bookmarkResults, setBookmarkResults] = useState<BookmarkItem[]>([]);

  const activeCommand = useMemo(() => parseActiveCommand(searchQuery), [searchQuery]);

  const isCommandMode = activeCommand !== null;
  const isBookmarkMode = activeCommand?.command.custom === true && activeCommand.command.key === "b";
  const isSuggestingCommands = !isCommandMode && searchQuery.startsWith(COMMAND_PREFIX);

  const commandSuggestions = useMemo(() => {
    if (!isSuggestingCommands) {
      return [];
    }

    const filter = searchQuery.slice(COMMAND_PREFIX.length).toLowerCase();
    if (!filter) return COMMANDS;
    return COMMANDS.filter(c => c.key.startsWith(filter) || c.label.toLowerCase().includes(filter));
  }, [isSuggestingCommands, searchQuery]);

  useEffect(() => {
    broadcastMsgToServiceWorker({ action: "getAllTabs" })
      .then((res) => setTabs(res as SearchableTab[]))
      .catch((e) => console.error("Error fetching tabs:", e));
  }, []);

  useEffect(() => {
    if (isCommandMode || isSuggestingCommands) {
      setFilteredTabs([]);
      let initial = 0;
      if (isCommandMode && !isBookmarkMode) initial = -1;
      setSelectedIndex(initial);
      return;
    }

    if (searchQuery.trim() === "") {
      setFilteredTabs(tabs);
      setSelectedIndex(0);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      broadcastMsgToServiceWorker({
        action: "orderTabsBySearchKeyword",
        data: { searchKeyword: searchQuery, tabs },
      })
        .then((res) => { if (!cancelled) setFilteredTabs(res as SearchableTab[]); })
        .catch((e) => console.error("Search error:", e));
    }, 50);
    setSelectedIndex(0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [searchQuery, tabs, isCommandMode, isSuggestingCommands, isBookmarkMode]);

  useEffect(() => {
    if (!activeCommand || activeCommand.command.custom || activeCommand.command.requiresKeyword === false) {
      setRecentCommands([]);
      return;
    }
    broadcastMsgToServiceWorker({
      action: "getRecentCommands",
      data: { commandKey: activeCommand.command.key },
    })
      .then((res) => setRecentCommands((res as string[]) ?? []))
      .catch(() => setRecentCommands([]));
  }, [activeCommand?.command.key]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isBookmarkMode) {
      setBookmarkResults([]);
      return;
    }

    let cancelled = false;
    const keyword = activeCommand?.keyword ?? "";
    const handle = setTimeout(() => {
      broadcastMsgToServiceWorker({
        action: "searchBookmarks",
        data: { searchKeyword: keyword },
      })
        .then((res) => { if (!cancelled) setBookmarkResults(groupBookmarksByFolder((res as BookmarkItem[]) ?? [])); })
        .catch(() => { if (!cancelled) setBookmarkResults([]); });
    }, 50);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [isBookmarkMode, activeCommand?.keyword]);  // eslint-disable-line react-hooks/exhaustive-deps

  return {
    searchQuery, setSearchQuery,
    tabs, filteredTabs,
    selectedIndex, setSelectedIndex,
    activeCommand, isCommandMode,
    isBookmarkMode,
    isSuggestingCommands, commandSuggestions,
    recentCommands,
    bookmarkResults,
  };
}

function CommandModeBody({
  activeCommand,
  recentCommands,
  selectedIndex,
  resultsRef,
  onSelectRecent,
}: {
  activeCommand: { command: CommandMeta; keyword: string };
  recentCommands: string[];
  selectedIndex: number;
  resultsRef: preact.RefObject<HTMLUListElement>;
  onSelectRecent: (keyword: string) => void;
}) {
  const cmd = activeCommand.command;
  const keyword = activeCommand.keyword.trim();
  const canRunWithoutKeyword = cmd.requiresKeyword === false;
  const hasContent = keyword || recentCommands.length > 0 || canRunWithoutKeyword;

  if (!hasContent) {
    return (
      <div className="command-panel">
        <div className="command-panel-icon"><CommandIcon /></div>
        <div className="command-panel-info">
          <span className="command-panel-desc">{cmd.description}</span>
        </div>
        <span className="command-panel-hint">Type a keyword to continue</span>
      </div>
    );
  }

  let previewAction = cmd.label;
  if (cmd.key === "s") {
    previewAction = looksLikeDomain(keyword) ? "Navigate to" : "Search the web for";
  }
  const previewLabel = keyword || cmd.description;

  return (
    <Fragment>
      {(keyword || canRunWithoutKeyword) && (
        <div className={`command-preview${selectedIndex >= 0 ? " command-preview-dimmed" : ""}`}>
          <div className="command-panel-icon"><CommandIcon /></div>
          <div className="command-preview-text">
            <span className="command-preview-action">{previewAction}</span>
            <span className="command-preview-keyword">{previewLabel}</span>
          </div>
          <kbd className="command-preview-enter">↵</kbd>
        </div>
      )}
      {recentCommands.length > 0 && (
        <Fragment>
          <div className="tab-count">Recent</div>
          <ul className="search-results" ref={resultsRef}>
            {recentCommands.map((kw, index) => (
              <li
                key={kw}
                onClick={() => onSelectRecent(kw)}
                className={`tab-item${index === selectedIndex ? " selected" : ""}`}
              >
                <div className="command-recent-icon"><HistoryIcon /></div>
                <div className="tab-info">
                  <span className="tab-title">{kw}</span>
                </div>
              </li>
            ))}
          </ul>
        </Fragment>
      )}
    </Fragment>
  );
}

const FOLDER_HUES = [8, 42, 82, 140, 190, 215, 260, 310, 340];

function hueForFolder(parentId: string | undefined): number {
  if (!parentId) return FOLDER_HUES[0];
  let hash = 0;
  for (let i = 0; i < parentId.length; i++) {
    hash = (hash * 31 + parentId.charCodeAt(i)) | 0;
  }
  return FOLDER_HUES[Math.abs(hash) % FOLDER_HUES.length];
}

function groupBookmarksByFolder(bookmarks: BookmarkItem[]): BookmarkItem[] {
  const groups = new Map<string, BookmarkItem[]>();
  for (const bm of bookmarks) {
    const key = bm.parentId ?? "__none__";
    const bucket = groups.get(key);
    if (bucket) bucket.push(bm);
    else groups.set(key, [bm]);
  }
  const result: BookmarkItem[] = [];
  for (const bucket of groups.values()) result.push(...bucket);
  return result;
}

function BookmarkModeBody({
  bookmarks,
  selectedIndex,
  resultsRef,
  onSelect,
}: {
  bookmarks: BookmarkItem[];
  selectedIndex: number;
  resultsRef: preact.RefObject<HTMLUListElement>;
  onSelect: (bookmark: BookmarkItem) => void;
}) {
  if (bookmarks.length === 0) {
    return <div className="no-results">No bookmarks found</div>;
  }

  const rows: Array<
    | { kind: "header"; key: string; title: string; hue: number; count: number }
    | { kind: "item"; key: string; bookmark: BookmarkItem; hue: number }
  > = [];
  let i = 0;
  while (i < bookmarks.length) {
    const first = bookmarks[i];
    const parentKey = first.parentId ?? "__none__";
    const hue = hueForFolder(first.parentId);
    let end = i + 1;
    while (end < bookmarks.length && (bookmarks[end].parentId ?? "__none__") === parentKey) end++;
    rows.push({
      kind: "header",
      key: `h:${parentKey}:${i}`,
      title: first.parentTitle || "Bookmarks",
      hue,
      count: end - i,
    });
    for (let j = i; j < end; j++) {
      rows.push({ kind: "item", key: bookmarks[j].id, bookmark: bookmarks[j], hue });
    }
    i = end;
  }

  return (
    <Fragment>
      <div className="tab-count">
        {bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}
      </div>
      <ul className="search-results bookmark-list" ref={resultsRef}>
        {(() => {
          let itemIndex = -1;
          return rows.map((row) => {
            if (row.kind === "header") {
              return (
                <li
                  key={row.key}
                  className="bookmark-folder-header"
                  style={{ "--folder-hue": row.hue } as preact.JSX.CSSProperties}
                >
                  <span className="bookmark-folder-dot" />
                  <span className="bookmark-folder-name">{row.title}</span>
                  <span className="bookmark-folder-count">{row.count}</span>
                </li>
              );
            }
            itemIndex++;
            const isSelected = itemIndex === selectedIndex;
            return (
              <li
                key={row.key}
                onClick={() => onSelect(row.bookmark)}
                className={`tab-item bookmark-item${isSelected ? " selected" : ""}`}
                style={{ "--folder-hue": row.hue } as preact.JSX.CSSProperties}
              >
                <FaviconImg favIconUrl={row.bookmark.favIconUrl} />
                <div className="tab-info">
                  <span className="tab-title">{row.bookmark.title || row.bookmark.url}</span>
                  <span className="tab-url">{extractDomain(row.bookmark.url)}</span>
                </div>
              </li>
            );
          });
        })()}
      </ul>
    </Fragment>
  );
}

export function SearchApp({ onClose }: { onClose?: () => void }) {
  const {
    searchQuery, setSearchQuery,
    filteredTabs,
    selectedIndex, setSelectedIndex,
    activeCommand, isCommandMode,
    isBookmarkMode,
    isSuggestingCommands, commandSuggestions,
    recentCommands,
    bookmarkResults,
  } = useSearch();

  const [hasNavigated, setHasNavigated] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);

  useEffect(() => searchInputRef.current?.focus(), []);

  useEffect(() => {
    if (!resultsRef.current) return;
    if (isBookmarkMode) {
      if (bookmarkResults.length > 0 && selectedIndex >= 0) {
        const el = resultsRef.current.querySelectorAll<HTMLElement>(".bookmark-item")[selectedIndex];
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } else if (isCommandMode && selectedIndex >= 0) {
      const el = resultsRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (!isCommandMode) {
      const totalItems = isSuggestingCommands ? commandSuggestions.length : filteredTabs.length;
      if (totalItems > 0) {
        const el = resultsRef.current.children[selectedIndex] as HTMLElement;
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, filteredTabs.length, commandSuggestions.length, bookmarkResults.length, isSuggestingCommands, isCommandMode, isBookmarkMode]);

  const selectCommand = (cmd: CommandMeta) => {
    const suffix = cmd.requiresKeyword === false ? "" : " ";
    setSearchQuery(`${COMMAND_PREFIX}${cmd.key}${suffix}`);
    setSelectedIndex(0);
  };

  const selectRecentQuery = (keyword: string) => {
    setSearchQuery(`${COMMAND_PREFIX}${activeCommand!.command.key} ${keyword}`);
  };

  const executeCommand = (cmdKey: string, keyword: string) => {
    if (keyword) {
      broadcastMsgToServiceWorker({
        action: "recordCommand",
        data: { commandKey: cmdKey, keyword },
      }).catch(console.error);
    }
    dispatchExecuteCommand(cmdKey, keyword);
    if (onClose) onClose();
  };

  const openBookmark = (bookmark: BookmarkItem) => {
    broadcastMsgToServiceWorker({
      action: "openBookmark",
      data: { url: bookmark.url },
    }).catch(console.error);
    if (onClose) onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    let maxIndex: number;
    if (isBookmarkMode) {
      maxIndex = bookmarkResults.length - 1;
    } else if (isCommandMode) {
      maxIndex = recentCommands.length - 1;
    } else if (isSuggestingCommands) {
      maxIndex = commandSuggestions.length - 1;
    } else {
      maxIndex = filteredTabs.length - 1;
    }

    switch (e.key) {
      case "Escape":
        if (onClose) onClose();
        return;
      case "ArrowDown":
        e.preventDefault();
        setHasNavigated(true);
        setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHasNavigated(true);
        setSelectedIndex((prev) => Math.max(prev - 1, isCommandMode && !isBookmarkMode ? -1 : 0));
        break;
      case "Enter":
        if (!isBookmarkMode && !isCommandMode && !isSuggestingCommands && !searchQuery.trim() && !hasNavigated) {
          if (onClose) onClose();
          return;
        }
        if (isBookmarkMode) {
          const bookmark = bookmarkResults[selectedIndex];
          if (bookmark) openBookmark(bookmark);
        } else if (isCommandMode) {
          const cmd = activeCommand!.command;
          if (selectedIndex >= 0 && recentCommands[selectedIndex]) {
            executeCommand(cmd.key, recentCommands[selectedIndex]);
          } else {
            const keyword = activeCommand!.keyword.trim();
            if (keyword || cmd.requiresKeyword === false) {
              executeCommand(cmd.key, keyword);
            }
          }
        } else if (isSuggestingCommands) {
          const cmd = commandSuggestions[selectedIndex] ?? commandSuggestions[0];
          if (cmd) selectCommand(cmd);
        } else if (filteredTabs[selectedIndex]) {
          const tab = filteredTabs[selectedIndex];
          // Send message before onClose - in popup mode, window.close() kills the JS context
          // before async messages fire if called first.
          if (tab.source === "recent") {
            broadcastMsgToServiceWorker({ action: "restoreRecentlyClosed", data: { sessionId: tab.sessionId } });
          } else {
            broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId: tab.id!, windowId: tab.windowId } });
          }
          if (onClose) onClose();
        }
        break;
      case " ":
        if (isSuggestingCommands && commandSuggestions.length > 0) {
          const typedKey = searchQuery.slice(COMMAND_PREFIX.length);
          // Exact key already typed (e.g. `!c`) — let space land naturally so the
          // keyword command activates, instead of auto-picking another suggestion.
          if (COMMAND_MAP.has(typedKey)) break;
          e.preventDefault();
          const cmd = commandSuggestions[selectedIndex] ?? commandSuggestions[0];
          if (cmd) selectCommand(cmd);
        }
        break;
    }
    e.stopPropagation();
  };

  let mode: HintMode = "normal";
  if (isBookmarkMode) {
    mode = "bookmark";
  } else if (isCommandMode) {
    mode = activeCommand!.command.requiresKeyword === false ? "action" : "command";
  } else if (isSuggestingCommands) {
    mode = "suggest";
  }

  return (
    <div id="tabaru-content">
      <div className="header">
        {isCommandMode ? <CommandIcon className="search-icon" /> : <SearchIcon className="search-icon" />}
        <input
          ref={searchInputRef}
          type="text"
          className={`search-input${isCommandMode ? " command-active" : ""}`}
          placeholder="Search tabs, or type ! for commands..."
          value={searchQuery}
          onInput={(e) => { setSearchQuery(clampQuery((e.target as HTMLInputElement).value)); setHasNavigated(false); }}
          onKeyDown={handleKeyDown}
        />
        <button className="close-button" onClick={() => onClose && onClose()}>×</button>
      </div>

      <div className="body">
        {isBookmarkMode ? (
          <BookmarkModeBody
            bookmarks={bookmarkResults}
            selectedIndex={selectedIndex}
            resultsRef={resultsRef}
            onSelect={openBookmark}
          />
        ) : isCommandMode ? (
          <CommandModeBody
            activeCommand={activeCommand!}
            recentCommands={recentCommands}
            selectedIndex={selectedIndex}
            resultsRef={resultsRef}
            onSelectRecent={selectRecentQuery}
          />
        ) : isSuggestingCommands ? (
          <Fragment>
            <div className="tab-count">Available Commands</div>
            <ul className="search-results" ref={resultsRef}>
              {commandSuggestions.map((cmd, index) => (
                <li
                  key={cmd.key}
                  onClick={() => selectCommand(cmd)}
                  className={`tab-item${index === selectedIndex ? " selected" : ""}`}
                >
                  <div className="command-panel-icon">
                    <CommandIcon />
                  </div>
                  <div className="tab-info">
                    <span className="tab-title">{cmd.label}</span>
                    <span className="tab-url">{cmd.description}</span>
                  </div>
                  <kbd className="cmd-shortcut-badge">!{cmd.key}</kbd>
                </li>
              ))}
            </ul>
          </Fragment>
        ) : (
          <Fragment>
            {filteredTabs.length > 0 ? (
              <Fragment>
                <div className="tab-count">
                  {filteredTabs.length} result{filteredTabs.length !== 1 ? "s" : ""}
                </div>
                <ul className="search-results" ref={resultsRef}>
                  {filteredTabs.map((tab, index) => (
                    <li
                      key={tab.resultId}
                      onClick={() => {
                        if (tab.source === "recent") {
                          broadcastMsgToServiceWorker({ action: "restoreRecentlyClosed", data: { sessionId: tab.sessionId } });
                        } else {
                          broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId: tab.id!, windowId: tab.windowId } });
                        }
                        if (onClose) onClose();
                      }}
                      className={[
                        "tab-item",
                        index === selectedIndex ? "selected" : "",
                        tab.source === "open" && tab.active ? "active-tab" : "",
                        tab.source === "recent" ? "recent-tab" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <TabComponent tab={tab} />
                    </li>
                  ))}
                </ul>
              </Fragment>
            ) : (
              <div className="no-results">No matching tabs found</div>
            )}
          </Fragment>
        )}
      </div>

      <KeyboardHints mode={mode} />
    </div>
  );
}

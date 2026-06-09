import browser from "webextension-polyfill";
import { BookmarkItem } from "../../types";
import { logger } from "../../utils";
import { generate_keyword_for_tab } from "ld-wasm-lib";
import { BOOKMARK_RESULT_LIMIT, bookmarksStore, wasmReadyPromise } from "./stores";
import { orderItemsBySearchKeyword } from "./tabs";

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
  const items = (await bookmarksStore.get()) ?? [];
  const sk = searchKeyword.toLowerCase();
  if (!sk) {
    return [...items]
      .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0))
      .slice(0, BOOKMARK_RESULT_LIMIT);
  }
  return orderItemsBySearchKeyword(sk, items).slice(0, BOOKMARK_RESULT_LIMIT);
}

export async function handleOpenBookmark(url: string): Promise<boolean> {
  await browser.tabs.create({ url });
  return true;
}

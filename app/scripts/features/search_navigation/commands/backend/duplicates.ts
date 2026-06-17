import browser from "webextension-polyfill";
import { CommandExecute } from "../types";
import { logger } from "../../../../utils";

/**
 * Group tabs by URL and close every duplicate, keeping one per group.
 * Keep priority: active > pinned > newest tab id.
 */
async function closeDuplicateTabs(): Promise<boolean> {
  const tabs = await browser.tabs.query({});
  const byUrl = new Map<string, browser.Tabs.Tab[]>();

  for (const t of tabs) {
    if (!t.url || t.id === undefined) continue;
    const bucket = byUrl.get(t.url);
    if (bucket) bucket.push(t);
    else byUrl.set(t.url, [t]);
  }

  const toClose: number[] = [];
  for (const group of byUrl.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    for (let i = 1; i < group.length; i++) {
      const id = group[i].id;
      if (id !== undefined) toClose.push(id);
    }
  }

  if (toClose.length > 0) {
    await browser.tabs.remove(toClose);
  }
  logger(`!dup: closed ${toClose.length} duplicate tab(s)`);
  return true;
}

export const duplicatesExecute: CommandExecute = () => closeDuplicateTabs();

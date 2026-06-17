import browser from "webextension-polyfill";
import { CommandExecute } from "../types";
import { logger } from "../../../../utils";

/** Close every tab (across all windows) whose URL or title contains `query`, case-insensitive. */
async function closeMatchingTabs(query: string): Promise<boolean> {
  const q = query.trim().toLowerCase();
  if (!q) return false;

  const tabs = await browser.tabs.query({});
  const toClose: number[] = [];
  for (const t of tabs) {
    if (t.id === undefined) continue;
    const url = (t.url || "").toLowerCase();
    const title = (t.title || "").toLowerCase();
    if (url.includes(q) || title.includes(q)) {
      toClose.push(t.id);
    }
  }

  if (toClose.length > 0) {
    await browser.tabs.remove(toClose);
  }
  logger(`!c: closed ${toClose.length} tab(s) matching "${query}"`);
  return true;
}

export const closeExecute: CommandExecute = (keyword) => closeMatchingTabs(keyword);

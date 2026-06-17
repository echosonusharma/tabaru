import browser from "webextension-polyfill";
import { CommandExecute } from "../types";
import { Store, logger, getNewTabUrls } from "../../../../utils";
import { StoreType } from "../../../../types";

interface SavedSessionTab {
  url: string;
  title?: string;
  pinned?: boolean;
}

interface SavedSession {
  tabs: SavedSessionTab[];
  savedAt: number;
}

type SavedSessions = Record<string, SavedSession>;

const savedSessionsStore = new Store<SavedSessions>("savedSessions", StoreType.LOCAL);

const NEW_TAB_URLS = getNewTabUrls();

function normaliseName(name: string): string {
  return name.trim();
}

async function saveSession(name: string): Promise<boolean> {
  const key = normaliseName(name);
  if (!key) return false;

  const tabs = await browser.tabs.query({ currentWindow: true });
  const session: SavedSession = {
    tabs: tabs
      .filter((t) => !!t.url && !NEW_TAB_URLS.has(t.url))
      .map((t) => ({ url: t.url!, title: t.title, pinned: t.pinned })),
    savedAt: Date.now(),
  };

  if (session.tabs.length === 0) {
    logger(`!sv: nothing to save for "${key}"`);
    return false;
  }

  const all = (await savedSessionsStore.get()) ?? {};
  all[key] = session;
  await savedSessionsStore.set(all);
  logger(`!sv: stored "${key}" with ${session.tabs.length} tab(s)`);
  return true;
}

async function openSession(name: string): Promise<boolean> {
  const key = normaliseName(name);
  if (!key) return false;

  const all = (await savedSessionsStore.get()) ?? {};
  const session = all[key];
  if (!session || session.tabs.length === 0) {
    logger(`!op: no session named "${key}"`);
    return false;
  }

  const urls = session.tabs.map((t) => t.url);
  await browser.windows.create({ url: urls });
  logger(`!op: restored "${key}" with ${urls.length} tab(s)`);
  return true;
}

export async function listSavedSessionNames(): Promise<string[]> {
  const all = (await savedSessionsStore.get()) ?? {};
  return Object.entries(all)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .map(([name]) => name);
}

export async function deleteSavedSession(name: string): Promise<boolean> {
  const key = normaliseName(name);
  if (!key) return false;
  const all = (await savedSessionsStore.get()) ?? {};
  if (!(key in all)) return false;
  delete all[key];
  await savedSessionsStore.set(all);
  logger(`!op: deleted session "${key}"`);
  return true;
}

export const saveExecute: CommandExecute = (keyword) => saveSession(keyword);
export const openExecute: CommandExecute = (keyword) => openSession(keyword);

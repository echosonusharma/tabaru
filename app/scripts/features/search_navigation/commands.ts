import { commandHistoryStore } from "./stores";
import { dispatchCommand } from "./commands/backend/dispatch";

export { listSavedSessionNames, deleteSavedSession } from "./commands/backend/sessions";

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

export const handleExecuteCommand = dispatchCommand;

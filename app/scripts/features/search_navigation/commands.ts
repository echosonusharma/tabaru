import { logger } from "../../utils";
import { commandHistoryStore } from "./stores";
import { handleSearch } from "./tabs";

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

export async function handleExecuteCommand(commandKey: string, keyword: string): Promise<boolean> {
  try {
    switch (commandKey) {
      case "s": {
        return await handleSearch(keyword);
      }
      default:
        logger(`Unknown command key: ${commandKey}`);
        return false;
    }
  } catch (error) {
    logger(`Error executing command '${commandKey}':`, error);
    return false;
  }
}

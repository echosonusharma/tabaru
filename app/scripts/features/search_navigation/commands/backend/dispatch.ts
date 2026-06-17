import { logger } from "../../../../utils";
import { CommandExecute } from "../types";
import { searchExecute } from "./search";
import { duplicatesExecute } from "./duplicates";
import { closeExecute } from "./close";

/**
 * Backend command registry. Maps command key → executor.
 * Only commands with side effects appear here (e.g. `!b` is UI-only).
 */
const EXECUTORS: Record<string, CommandExecute> = {
  s: searchExecute,
  d: duplicatesExecute,
  c: closeExecute,
};

export async function dispatchCommand(commandKey: string, keyword: string): Promise<boolean> {
  const exec = EXECUTORS[commandKey];
  if (!exec) {
    logger(`Unknown or non-executable command key: ${commandKey}`);
    return false;
  }
  try {
    return await exec(keyword);
  } catch (error) {
    logger(`Error executing command '${commandKey}':`, error);
    return false;
  }
}

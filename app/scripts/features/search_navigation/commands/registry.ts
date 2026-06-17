import { CommandMeta } from "./types";
import { searchMeta } from "./search";
import { bookmarksMeta } from "./bookmarks";
import { duplicatesMeta } from "./duplicates";

/** UI-side registry. Order = order shown in the suggestion list. */
export const COMMANDS: CommandMeta[] = [
  searchMeta,
  bookmarksMeta,
  duplicatesMeta,
];

export const COMMAND_MAP = new Map<string, CommandMeta>(
  COMMANDS.map((c) => [c.key, c])
);

import { CommandMeta } from "./types";
import { searchMeta } from "./search";
import { bookmarksMeta } from "./bookmarks";
import { duplicatesMeta } from "./duplicates";
import { closeMeta } from "./close";

/** UI-side registry. Order = order shown in the suggestion list. */
export const COMMANDS: CommandMeta[] = [
  searchMeta,
  bookmarksMeta,
  duplicatesMeta,
  closeMeta,
];

export const COMMAND_MAP = new Map<string, CommandMeta>(
  COMMANDS.map((c) => [c.key, c])
);

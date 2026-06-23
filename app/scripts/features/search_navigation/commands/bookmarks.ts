import { CommandMeta } from "./types";

/** Bookmark search uses a dedicated overlay UI (BookmarkModeBody) — no execute. */
export const bookmarksMeta: CommandMeta = {
  key: "b",
  label: "Bookmarks",
  description: "Search through your bookmarks",
  requiresKeyword: true,
  custom: true,
};

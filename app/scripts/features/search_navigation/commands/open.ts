import { CommandMeta } from "./types";

export const openMeta: CommandMeta = {
  key: "op",
  label: "Open session",
  description: "Restore a saved session by name in a new window",
  requiresKeyword: true,
  pickListAction: "listSavedSessions",
  pickListLabel: "Saved sessions",
  deleteListAction: "deleteSavedSession",
};

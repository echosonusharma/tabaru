import { CommandMeta } from "./types";

export const saveMeta: CommandMeta = {
  key: "sv",
  label: "Save session",
  description: "Snapshot the current window's tabs under a name",
  requiresKeyword: true,
};

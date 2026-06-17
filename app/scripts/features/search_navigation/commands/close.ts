import { CommandMeta } from "./types";

export const closeMeta: CommandMeta = {
  key: "c",
  label: "Close matching",
  description: "Close every tab whose title or URL contains the keyword",
  requiresKeyword: true,
};

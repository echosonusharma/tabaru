/**
 * Shared types for the search-overlay command system (`!key keyword`).
 *
 * Add a new command:
 *   1. Create `commands/<name>.ts` exporting a CommandMeta (UI-safe).
 *   2. If it has a side-effect, create `commands/backend/<name>.ts`
 *      exporting a CommandExecute, then register both in
 *      `commands/registry.ts` and `commands/backend/dispatch.ts`.
 *
 * The split keeps backend deps (tabs API, WASM, etc.) out of the
 * content-script bundle that imports the UI registry.
 */
export interface CommandMeta {
  /** Trigger key (one or more chars), e.g. "s", "dup", "save". */
  key: string;
  /** Short label shown in the suggestion list. */
  label: string;
  /** One-line description shown next to the label. */
  description: string;
  /**
   * When false, command may be executed with an empty keyword
   * (e.g. `!dup` runs immediately). Default: true.
   */
  requiresKeyword?: boolean;
  /**
   * When true, the overlay renders a command-specific UI instead of the
   * generic preview row. Used by `!b` (bookmark search) today.
   */
  custom?: boolean;
  /**
   * When set, the overlay populates the picker list from this message action
   * (returning string[]) instead of the user's command history.
   * Used by `!op` to show saved session names.
   */
  pickListAction?: string;
  /** Header shown above the picker list. Default "Recent". */
  pickListLabel?: string;
  /**
   * When set, each picker row gets a delete button that dispatches this message
   * action with `{ name }` payload. UI then refreshes via pickListAction.
   */
  deleteListAction?: string;
}

/** Backend handler — runs in the service worker. Return true on success. */
export type CommandExecute = (keyword: string) => Promise<boolean>;

import browser from 'webextension-polyfill';
import { StoreType, TabGroupRule, ManagedTabGroupMap, TabGroupColor } from '../../types';
import { Store, logger } from "../../utils";

// --- Tab Group Colors ---

export const TAB_GROUP_COLORS: TabGroupColor[] = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

export const TAB_GROUP_COLOR_HEX: Record<TabGroupColor, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#1e8e3e',
  pink: '#e65590',
  purple: '#8430ce',
  cyan: '#007b83',
  orange: '#fa903e',
};

// --- URL Pattern Logic ---

type PatternProtocol = "*" | "http" | "https";
type PatternHostKind = "any" | "exact" | "subdomain-wildcard";
type PatternPathKind = "any" | "exact" | "prefix";

export interface ParsedPattern {
  protocol: PatternProtocol;
  host: string;
  hostKind: PatternHostKind;
  path: string;
  pathKind: PatternPathKind;
}

export interface UrlPatternValidationResult {
  isValid: boolean;
  error?: string;
  parsed?: ParsedPattern;
}

function hasInvalidHostLabel(label: string): boolean {
  if (!label) return true;
  for (const char of label) {
    const isLowerAlpha = char >= "a" && char <= "z";
    const isUpperAlpha = char >= "A" && char <= "Z";
    const isDigit = char >= "0" && char <= "9";
    if (!isLowerAlpha && !isUpperAlpha && !isDigit && char !== "-") {
      return true;
    }
  }
  return false;
}

function validateHost(host: string): { isValid: boolean; error?: string; hostKind?: PatternHostKind; normalizedHost?: string } {
  if (!host) {
    return { isValid: false, error: "Host is required." };
  }

  if (host === "*") {
    return { isValid: true, hostKind: "any", normalizedHost: host };
  }

  let normalizedHost = host.toLowerCase();
  let hostKind: PatternHostKind = "exact";

  if (normalizedHost.startsWith("*.")) {
    hostKind = "subdomain-wildcard";
    normalizedHost = normalizedHost.slice(2);

    if (!normalizedHost) {
      return { isValid: false, error: "Wildcard hosts must include a base domain, for example *.springer.com." };
    }
  }

  if (normalizedHost.includes("*")) {
    return { isValid: false, error: "Host wildcards are only supported as a leading *." };
  }

  const labels = normalizedHost.split(".");
  if (labels.some(hasInvalidHostLabel)) {
    return { isValid: false, error: "Host contains an invalid domain label." };
  }

  return { isValid: true, hostKind, normalizedHost };
}

function validatePath(path: string): { isValid: boolean; error?: string; pathKind?: PatternPathKind; normalizedPath?: string } {
  if (!path) {
    return { isValid: false, error: "Path is required. Use /* to match an entire site." };
  }

  if (path[0] !== "/") {
    return { isValid: false, error: "Path must start with /." };
  }

  if (path === "/*") {
    return { isValid: true, pathKind: "any", normalizedPath: path };
  }

  const starIndex = path.indexOf("*");
  if (starIndex === -1) {
    return { isValid: true, pathKind: "exact", normalizedPath: path };
  }

  if (!path.endsWith("/*")) {
    return { isValid: false, error: "Path wildcards are only supported as a trailing /* suffix." };
  }

  if (path.slice(0, -2).includes("*")) {
    return { isValid: false, error: "Only one trailing path wildcard is supported." };
  }

  return { isValid: true, pathKind: "prefix", normalizedPath: path };
}

export function parseUrlPattern(pattern: string): UrlPatternValidationResult {
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return { isValid: false, error: "Pattern is required." };
  }

  const protoEnd = trimmedPattern.indexOf("://");
  if (protoEnd === -1) {
    return { isValid: false, error: "Pattern must include a protocol such as https:// or *://." };
  }

  const protocolValue = trimmedPattern.slice(0, protoEnd).toLowerCase();
  if (protocolValue !== "*" && protocolValue !== "http" && protocolValue !== "https") {
    return { isValid: false, error: "Protocol must be http, https, or *." };
  }

  const rest = trimmedPattern.slice(protoEnd + 3);
  const pathStart = rest.indexOf("/");
  if (pathStart === -1) {
    return { isValid: false, error: "Pattern must include a path. Use /* to match all paths." };
  }

  const host = rest.slice(0, pathStart);
  const path = rest.slice(pathStart);

  const hostValidation = validateHost(host);
  if (!hostValidation.isValid) {
    return { isValid: false, error: hostValidation.error };
  }

  const pathValidation = validatePath(path);
  if (!pathValidation.isValid) {
    return { isValid: false, error: pathValidation.error };
  }

  return {
    isValid: true,
    parsed: {
      protocol: protocolValue,
      host: hostValidation.normalizedHost!,
      hostKind: hostValidation.hostKind!,
      path: pathValidation.normalizedPath!,
      pathKind: pathValidation.pathKind!,
    },
  };
}

export function validateUrlPattern(pattern: string): boolean {
  return parseUrlPattern(pattern).isValid;
}

export function getUrlPatternValidationError(pattern: string): string {
  const result = parseUrlPattern(pattern);
  return result.error || "";
}

export function normalizeUrlPattern(pattern: string): string {
  const result = parseUrlPattern(pattern);
  if (!result.isValid || !result.parsed) {
    return pattern.trim();
  }

  const parsed = result.parsed;
  const host = parsed.hostKind === "subdomain-wildcard" ? `*.${parsed.host}` : parsed.host;
  return `${parsed.protocol}://${host}${parsed.path}`;
}

function matchesHost(hostname: string, parsed: ParsedPattern): boolean {
  if (parsed.hostKind === "any") {
    return true;
  }

  if (parsed.hostKind === "exact") {
    return hostname === parsed.host;
  }

  return hostname === parsed.host || hostname.endsWith(`.${parsed.host}`);
}

function matchesPath(pathname: string, parsed: ParsedPattern): boolean {
  if (parsed.pathKind === "any") {
    return true;
  }

  if (parsed.pathKind === "exact") {
    return pathname === parsed.path;
  }

  const prefix = parsed.path.slice(0, -2);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function matchesUrlPattern(url: string, pattern: string): boolean {
  const parsedResult = parseUrlPattern(pattern);
  if (!parsedResult.isValid || !parsedResult.parsed) {
    return false;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    return false;
  }

  const urlProtocol = urlObj.protocol.slice(0, -1).toLowerCase();
  const urlHost = urlObj.hostname.toLowerCase();
  const urlPath = urlObj.pathname;

  if (parsedResult.parsed.protocol !== "*" && parsedResult.parsed.protocol !== urlProtocol) {
    return false;
  }

  return matchesHost(urlHost, parsedResult.parsed) && matchesPath(urlPath, parsedResult.parsed);
}

export function extractDomainFromPattern(pattern: string): string {
  const parsedResult = parseUrlPattern(pattern);
  if (!parsedResult.isValid || !parsedResult.parsed || parsedResult.parsed.hostKind === "any") {
    return "tabs";
  }

  const host = parsedResult.parsed.host;
  const parts = host.split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

export function describeUrlPattern(pattern: string): string {
  const parsedResult = parseUrlPattern(pattern);
  if (!parsedResult.isValid || !parsedResult.parsed) {
    return "Use protocol://host/path with optional leading *., *://, and trailing /*.";
  }

  const { protocol, host, hostKind, path, pathKind } = parsedResult.parsed;
  const schemeLabel = protocol === "*" ? "http and https" : protocol;
  const hostLabel =
    hostKind === "any"
      ? "any host"
      : hostKind === "subdomain-wildcard"
        ? `${host} and its subdomains`
        : host;
  const pathLabel =
    pathKind === "any"
      ? "every path"
      : pathKind === "prefix"
        ? `${path.slice(0, -2)} and anything below it`
        : `exactly ${path}`;

  return `Matches ${schemeLabel} on ${hostLabel} for ${pathLabel}.`;
}

export function normalizeTabGroupRule(rule: TabGroupRule): TabGroupRule {
  const now = Date.now();
  const normalizedPattern = normalizeUrlPattern(rule.pattern);
  const normalizedTitle = rule.title?.trim();

  return {
    ...rule,
    pattern: normalizedPattern,
    title: normalizedTitle || undefined,
    color: rule.color,
    collapsed: !!rule.collapsed,
    enabled: rule.enabled !== false,
    createdAt: rule.createdAt ?? now,
    updatedAt: rule.updatedAt ?? now,
  };
}

export function normalizeTabGroupRules(rules: TabGroupRule[] | undefined | null): TabGroupRule[] {
  return (rules || []).map(normalizeTabGroupRule);
}

export function randomTabGroupColor(): TabGroupColor {
  return TAB_GROUP_COLORS[Math.floor(Math.random() * TAB_GROUP_COLORS.length)];
}

// --- Stores ---
export const tabGroupRulesStore: Store<TabGroupRule[]> = new Store("tabGroupRules", StoreType.LOCAL);
export const managedTabGroupsStore: Store<ManagedTabGroupMap> = new Store("managedTabGroups", StoreType.SESSION);

// --- Constants & Helpers ---
export const DOMAIN_RULE_EXAMPLES = [
  {
    pattern: 'https://example.com/*',
    description: 'Matches the main example.com domain on every path.',
  },
  {
    pattern: 'https://*.example.com/*',
    description: 'Matches example.com and any subdomain on every path.',
  },
  {
    pattern: 'https://*.example.com/specific_path',
    description: 'Matches a single exact path across example.com and its subdomains.',
  },
  {
    pattern: 'https://example.com/specific_path',
    description: 'Matches one exact path on the main example.com domain only.',
  },
  {
    pattern: '*://*.example.com/*',
    description: 'Matches both http and https across example.com and its subdomains.',
  },
  {
    pattern: 'https://*.example.com/specific_path/*',
    description: 'Matches a path prefix and anything below it on example.com subdomains.',
  },
] as const;

export function buildEmptyRuleDraft(): TabGroupRule {
  return {
    id: '',
    pattern: '',
    title: '',
    color: undefined,
    collapsed: false,
    enabled: true,
  };
}

// --- Background Logic ---

const chromeApi = (globalThis as any).chrome;

function checkChromeTabGroupsSupport(): boolean {
  return (
    typeof chromeApi?.tabs?.group === "function" &&
    typeof chromeApi?.tabs?.ungroup === "function" &&
    typeof chromeApi?.tabGroups?.get === "function" &&
    typeof chromeApi?.tabGroups?.update === "function"
  );
}

async function chromeGroupTab(tabId: number, groupId?: number): Promise<number | null> {
  try {
    if (!checkChromeTabGroupsSupport()) return null;
    return await chromeApi.tabs.group({ tabIds: tabId, ...(groupId !== undefined ? { groupId } : {}) });
  } catch (e) {
    logger('chromeGroupTab error:', e);
    return null;
  }
}

async function chromeGroupTabs(tabIds: number[], windowId: number, groupId?: number): Promise<number | null> {
  try {
    if (!checkChromeTabGroupsSupport() || tabIds.length === 0) return null;
    return await chromeApi.tabs.group({
      tabIds,
      ...(groupId !== undefined ? { groupId } : { createProperties: { windowId } }),
    });
  } catch {
    return null;
  }
}

async function chromeGetTabGroup(groupId: number): Promise<any | null> {
  try {
    if (!checkChromeTabGroupsSupport()) return null;
    return await chromeApi.tabGroups.get(groupId);
  } catch {
    return null;
  }
}

async function chromeUpdateTabGroup(groupId: number, props: { title?: string; color?: string; collapsed?: boolean }): Promise<void> {
  try {
    if (!checkChromeTabGroupsSupport()) return;
    await chromeApi.tabGroups.update(groupId, props);
  } catch (e) {
    logger('chromeUpdateTabGroup error:', e);
  }
}

async function chromeUngroupTabs(tabIds: number[]): Promise<void> {
  try {
    if (!checkChromeTabGroupsSupport() || tabIds.length === 0) return;
    await chromeApi.tabs.ungroup(tabIds);
  } catch (e) {
    logger("chromeUngroupTabs error:", e);
  }
}

function getResolvedGroupTitle(rule: TabGroupRule): string {
  return rule.title || extractDomainFromPattern(rule.pattern);
}

function getResolvedGroupColor(rule: TabGroupRule, existingColor?: string): string {
  return rule.color || existingColor || randomTabGroupColor();
}

function getManagedGroupKey(ruleId: string, pinned: boolean): string {
  return `${ruleId}:${pinned ? "pinned" : "regular"}`;
}

function getManagedRuleIdFromKey(groupKey: string): string {
  const separatorIndex = groupKey.lastIndexOf(":");
  return separatorIndex === -1 ? groupKey : groupKey.slice(0, separatorIndex);
}

function getManagedGroupId(managedGroups: ManagedTabGroupMap, windowId: number, groupKey: string): number | undefined {
  return managedGroups[String(windowId)]?.[groupKey];
}

function findManagedGroupKeyByGroupId(managedGroups: ManagedTabGroupMap, windowId: number, groupId?: number): string | undefined {
  if (groupId === undefined || groupId < 0) {
    return undefined;
  }

  const windowGroups = managedGroups[String(windowId)] || {};
  return Object.keys(windowGroups).find((groupKey) => windowGroups[groupKey] === groupId);
}

async function ensureManagedGroupForRule(
  managedGroups: ManagedTabGroupMap,
  rule: TabGroupRule,
  windowId: number,
  pinned: boolean,
  tabIds: number[]
): Promise<number | null> {
  const groupKey = getManagedGroupKey(rule.id, pinned);
  const existingGroupId = getManagedGroupId(managedGroups, windowId, groupKey);
  const existingGroup = existingGroupId !== undefined ? await chromeGetTabGroup(existingGroupId) : null;

  const groupId =
    existingGroup?.windowId === windowId
      ? await chromeGroupTabs(tabIds, windowId, existingGroup.id)
      : await chromeGroupTabs(tabIds, windowId);

  if (groupId === null) {
    return null;
  }

  await chromeUpdateTabGroup(groupId, {
    title: getResolvedGroupTitle(rule),
    color: getResolvedGroupColor(rule, existingGroup?.color),
    collapsed: !!rule.collapsed,
  });

  const windowKey = String(windowId);
  managedGroups[windowKey] = {
    ...(managedGroups[windowKey] || {}),
    [groupKey]: groupId,
  };
  await managedTabGroupsStore.set(managedGroups);

  return groupId;
}

export async function applyTabGroupRules(tab: browser.Tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url || !tab.windowId) return;

  try {
    const rules = normalizeTabGroupRules(await tabGroupRulesStore.get()).filter((rule) => rule.enabled !== false);
    const managedGroups = (await managedTabGroupsStore.get()) || {};
    const matchingRule = rules.find((rule) => matchesUrlPattern(tab.url!, rule.pattern));
    const currentManagedGroupKey = findManagedGroupKeyByGroupId(managedGroups, tab.windowId, tab.groupId);

    if (!matchingRule) {
      if (currentManagedGroupKey) {
        await chromeUngroupTabs([tab.id]);
      }
      return;
    }

    const targetGroupKey = getManagedGroupKey(matchingRule.id, !!tab.pinned);
    if (currentManagedGroupKey && currentManagedGroupKey !== targetGroupKey) {
      await chromeUngroupTabs([tab.id]);
    }

    const targetGroupId = await ensureManagedGroupForRule(managedGroups, matchingRule, tab.windowId, !!tab.pinned, [tab.id]);
    if (targetGroupId === null) {
      return;
    }

    if (tab.groupId !== targetGroupId) {
      await chromeGroupTab(tab.id, targetGroupId);
    }
  } catch (error) {
    logger("Error applying tab group rules:", error);
  }
}

export async function applyTabGroupRulesToAllTabs(): Promise<void> {
  try {
    const [allTabs, existingManagedGroups, rawRules] = await Promise.all([
      browser.tabs.query({}),
      managedTabGroupsStore.get(),
      tabGroupRulesStore.get(),
    ]);

    const managedGroups = existingManagedGroups || {};
    const managedGroupIds = new Set<number>();
    for (const windowGroups of Object.values(managedGroups)) {
      for (const groupId of Object.values(windowGroups)) {
        managedGroupIds.add(groupId);
      }
    }

    const tabsToUngroup = allTabs
      .filter((tab) => typeof tab.id === "number" && typeof tab.groupId === "number" && managedGroupIds.has(tab.groupId))
      .map((tab) => tab.id as number);

    if (tabsToUngroup.length > 0) {
      await chromeUngroupTabs(tabsToUngroup);
    }

    const rules = normalizeTabGroupRules(rawRules).filter((rule) => rule.enabled !== false);
    const nextManagedGroups: ManagedTabGroupMap = {};
    const groupedTabs = new Map<string, number[]>();

    for (const tab of allTabs) {
      if (!tab.id || !tab.url || !tab.windowId) {
        continue;
      }

      const matchingRule = rules.find((rule) => matchesUrlPattern(tab.url!, rule.pattern));
      if (!matchingRule) {
        continue;
      }

      const key = `${tab.windowId}:${getManagedGroupKey(matchingRule.id, !!tab.pinned)}`;
      const tabIds = groupedTabs.get(key) || [];
      tabIds.push(tab.id);
      groupedTabs.set(key, tabIds);
    }

    for (const [key, tabIds] of groupedTabs.entries()) {
      const separatorIndex = key.indexOf(":");
      const windowId = Number(key.slice(0, separatorIndex));
      const groupKey = key.slice(separatorIndex + 1);
      const ruleId = getManagedRuleIdFromKey(groupKey);
      const rule = rules.find((item) => item.id === ruleId);

      if (!rule) {
        continue;
      }

      const groupId = await chromeGroupTabs(tabIds, windowId);
      if (groupId === null) {
        continue;
      }

      await chromeUpdateTabGroup(groupId, {
        title: getResolvedGroupTitle(rule),
        color: rule.color || randomTabGroupColor(),
        collapsed: !!rule.collapsed,
      });

      const windowKey = String(windowId);
      nextManagedGroups[windowKey] = {
        ...(nextManagedGroups[windowKey] || {}),
        [groupKey]: groupId,
      };
    }

    await managedTabGroupsStore.set(nextManagedGroups);
  } catch (error) {
    logger("Error applying tab group rules to all tabs:", error);
  }
}

export async function groupTabsForRuleNow(ruleId: string): Promise<boolean> {
  try {
    const [allTabs, rawRules, existingManagedGroups] = await Promise.all([
      browser.tabs.query({}),
      tabGroupRulesStore.get(),
      managedTabGroupsStore.get(),
    ]);

    const rules = normalizeTabGroupRules(rawRules);
    const rule = rules.find((item) => item.id === ruleId && item.enabled !== false);
    if (!rule) {
      return false;
    }

    const managedGroups = existingManagedGroups || {};
    const matchingTabs = allTabs.filter(
      (tab) =>
        typeof tab.id === "number" &&
        typeof tab.windowId === "number" &&
        typeof tab.url === "string" &&
        matchesUrlPattern(tab.url, rule.pattern)
    );
    if (matchingTabs.length === 0) {
      return true;
    }

    const managedGroupIds = new Set<number>();
    for (const windowGroups of Object.values(managedGroups)) {
      for (const groupId of Object.values(windowGroups)) {
        managedGroupIds.add(groupId);
      }
    }

    const tabsToUngroup = matchingTabs
      .filter((tab) => typeof tab.id === "number" && typeof tab.groupId === "number" && managedGroupIds.has(tab.groupId))
      .map((tab) => tab.id as number);

    if (tabsToUngroup.length > 0) {
      await chromeUngroupTabs(tabsToUngroup);
    }

    const tabsByWindow = new Map<string, { windowId: number; pinned: boolean; tabIds: number[] }>();
    for (const tab of matchingTabs) {
      const windowId = tab.windowId as number;
      const tabId = tab.id as number;
      const groupKey = getManagedGroupKey(rule.id, !!tab.pinned);
      const bucketKey = `${windowId}:${groupKey}`;
      const bucket = tabsByWindow.get(bucketKey) || {
        windowId,
        pinned: !!tab.pinned,
        tabIds: [],
      };
      bucket.tabIds.push(tabId);
      tabsByWindow.set(bucketKey, bucket);
    }

    for (const bucket of tabsByWindow.values()) {
      const groupId = await chromeGroupTabs(bucket.tabIds, bucket.windowId);
      if (groupId === null) {
        continue;
      }

      await chromeUpdateTabGroup(groupId, {
        title: getResolvedGroupTitle(rule),
        color: rule.color || randomTabGroupColor(),
        collapsed: !!rule.collapsed,
      });

      const windowKey = String(bucket.windowId);
      const groupKey = getManagedGroupKey(rule.id, bucket.pinned);
      managedGroups[windowKey] = {
        ...(managedGroups[windowKey] || {}),
        [groupKey]: groupId,
      };
    }

    await managedTabGroupsStore.set(managedGroups);
    return true;
  } catch (error) {
    logger("Error grouping tabs for rule now:", error);
    return false;
  }
}

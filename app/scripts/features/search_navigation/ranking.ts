import { ld } from "ld-wasm-lib";
import { SearchableTab } from "../../types";

export interface RankableItem {
  title?: string;
  url?: string;
  keywords?: string[];
  fts?: number;
  ld?: number;
  matchIndex?: number;
}

export function orderItemsBySearchKeyword<T extends RankableItem>(searchKeyword: string, items: T[]): T[] {
  const sk = searchKeyword.toLowerCase();

  if (!sk) return items;

  for (const item of items) {
    const fullText = ((item.title || "") + " " + (item.url || "")).toLowerCase();
    const matchIndex = fullText.indexOf(sk);

    // 1. Check Full Substring Match First (FTS) against the whole title+url
    if (matchIndex !== -1) {
      item.fts = 1;
      item.ld = 0; // Skip WASM entirely! Zero distance is perfect.
      item.matchIndex = matchIndex;
      continue;
    }

    // 2. Fallback to Levenshtein against keywords
    const keywords = item.keywords ?? [];
    item.fts = 0;
    item.ld = keywords.length > 0 ? Math.min(...keywords.map((w) => ld(sk, w.toLowerCase()))) : Infinity;
    item.matchIndex = Infinity;
  }

  items.sort((a, b) => {
    const ftsA = a.fts ?? 0;
    const ftsB = b.fts ?? 0;

    // FTS matches always beat Levenshtein matches
    if (ftsA !== ftsB) {
      return ftsB - ftsA;
    }

    // If BOTH are FTS matches, rank by which match happens earlier in the string
    if (ftsA === 1 && ftsB === 1) {
      return (a.matchIndex ?? Infinity) - (b.matchIndex ?? Infinity);
    }

    // If NEITHER are FTS matches, rank by Levenshtein distance
    return (a.ld ?? Infinity) - (b.ld ?? Infinity);
  });

  return items;
}

export function orderTabsBySearchKeyword(searchKeyword: string, tabs: SearchableTab[]): SearchableTab[] {
  return orderItemsBySearchKeyword(searchKeyword, tabs);
}

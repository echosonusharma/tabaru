import browser from "webextension-polyfill";

export const FAVICON_CACHE_KEY = "favicon_cache";
export const FAVICON_TTL = 24 * 60 * 60 * 1000;
export type FaviconEntry = { data: string; timestamp: number };

let faviconMemoryCache: Record<string, FaviconEntry> | null = null;

export async function handleFetchFavicon(iconUrl: string): Promise<string> {
  const now = Date.now();

  if (!faviconMemoryCache) {
    const result = await browser.storage.local.get(FAVICON_CACHE_KEY);
    const cache = (result[FAVICON_CACHE_KEY] ?? {}) as Record<string, FaviconEntry>;

    let hasStaleEntries = false;
    for (const key of Object.keys(cache)) {
      if (now - cache[key].timestamp >= FAVICON_TTL) {
        delete cache[key];
        hasStaleEntries = true;
      }
    }

    faviconMemoryCache = cache;

    if (hasStaleEntries) {
      await browser.storage.local.set({ [FAVICON_CACHE_KEY]: faviconMemoryCache });
    }
  }

  const entry = faviconMemoryCache[iconUrl];

  if (entry && now - entry.timestamp < FAVICON_TTL) {
    return entry.data;
  }

  try {
    const res = await fetch(iconUrl);
    if (!res.ok) throw new Error("Fetch failed");

    const buffer = await res.arrayBuffer();

    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const contentType = res.headers.get("content-type") || "image/png";
    const dataUrl = `data:${contentType};base64,${base64}`;

    faviconMemoryCache[iconUrl] = { data: dataUrl, timestamp: now };
    await browser.storage.local.set({ [FAVICON_CACHE_KEY]: faviconMemoryCache });

    return dataUrl;
  } catch (error) {
    return entry?.data || "";
  }
}

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';

type TopSite = { url: string; title?: string };

function faviconUrl(pageUrl: string): string | undefined {
  try {
    const { hostname } = new URL(pageUrl);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return undefined;
  }
}

export function QuickAccessBar() {
  const [sites, setSites] = useState<TopSite[]>([]);

  useEffect(() => {
    browser.topSites.get()
      .then(all => setSites(all.slice(0, 6)))
      .catch((err) => console.warn('[QuickAccess] topSites unavailable:', err));
  }, []);

  if (sites.length === 0) return null;

  return (
    <div class="nt-quick-access">
      {sites.map(site => {
        const favicon = faviconUrl(site.url);
        return (
          <a
            key={site.url}
            href={site.url}
            title={site.title}
            class="nt-qa-item"
          >
            {favicon && (
              <img
                class="nt-qa-favicon"
                src={favicon}
                alt=""
                width="20"
                height="20"
              />
            )}
          </a>
        );
      })}
    </div>
  );
}

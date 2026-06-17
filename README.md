<p align="center">
  <img src="app/images/tabaru-icon.svg" width="120" height="120" alt="Tabaru">
</p>

<h1 align="center">Tabaru</h1>

<p align="center">
  Keyboard-first tab management for the browser.<br>
  Fuzzy search every tab, restore closed sessions, auto-group by URL, replace your new tab page.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/tabaru/ameinjfiidfphkdbmdhlebibjgafdokc">Chrome Web Store</a>
  ·
  <a href="https://tabaru.app">Website</a>
  ·
  <a href="PRIVACY_POLICY.md">Privacy</a>
</p>

## Features

### Fuzzy tab search
One overlay searches every open tab across every window, plus recently closed sessions. Character-rank scoring with sub-millisecond match. Switch to a tab, restore a closed one, or kill the current tab without ever touching the mouse.

### Auto tab groups *(Chromium)*
Define URL pattern rules like `https://*.github.com/*`. Matching tabs auto-group with a custom title, color, and collapsed state. Set it once, forget it.

### Commands
- `!s <query>` - web search or jump straight to a domain
- `!b <query>` - fuzzy-search bookmarks, grouped by folder

### New tab page
Replaces your browser's default new tab with something useful:
- Clock (12h / 24h) and greeting
- Live weather via Open-Meteo or wttr.in, with animated weather effects
- Quick-access links pulled from your most-visited sites
- Wallpaper modes: solid color, gradient, or random photo (Picsum)

### Themes
Tabaru, Forest, Mocha, Midnight. Swap instantly, no reload.

### Privacy
Zero telemetry. No analytics. No remote backend. Everything runs locally in the browser - the only outbound calls are optional weather and wallpaper fetches you opt into.

### Cross-browser
Chrome, Firefox, Edge, Opera. Manifest V3.

## Shortcuts

| Action | Default |
|---|---|
| Open search | `Alt+Q` |
| Next tab | `Alt+X` |
| Previous tab | `Alt+Z` |
| Close current tab | `Alt+W` |

Remap any of these in your browser's extension shortcut settings.

## Install

**Chrome / Edge / Opera** - install from the [Chrome Web Store](https://chromewebstore.google.com/detail/tabaru/ameinjfiidfphkdbmdhlebibjgafdokc).

**Firefox** - grab the latest `.xpi` from [GitHub Releases](https://github.com/echosonusharma/tabaru/releases/latest) and install it.

## Build from source

```bash
npm install
npm run dev <chrome|firefox|edge|opera>     # dev with hot reload
npm run build <chrome|firefox|edge|opera>   # production build
```

Output lands in `dist/<browser>`.

## License

MIT

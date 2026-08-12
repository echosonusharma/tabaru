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
  <a href="https://tabaru.echosonusharma.in">Website</a>
  ·
  <a href="PRIVACY_POLICY.md">Privacy</a>
</p>

## Features

- **Fuzzy tab search** - Search every open tab and recently closed session. Switch, restore, close, or reorder without the mouse.
- **Auto tab groups** *(Chromium)* - Group tabs by URL patterns with custom title, color, and collapse state.
- **Commands** - `!s` web search, `!b` bookmarks, `!d` dedupe tabs, `!c` bulk close, `!sv` / `!op` session snapshots.
- **New tab page** - Clock, weather, quick links, and wallpaper modes.
- **Themes** - Tabaru, Forest, Mocha, Midnight.
- **Privacy** - No telemetry or remote backend. Optional weather and wallpaper fetches only.
- **Cross-browser** - Chrome, Firefox, Edge, Opera (Manifest V3).

## Shortcuts

| Action | Default |
|---|---|
| Open search | `Alt+Q` |
| Next tab | `Alt+X` |
| Previous tab | `Alt+Z` |
| Close current tab | `Alt+W` |
| Move tab left / right | custom |
| Next / previous window | custom |

All shortcuts are suggestions - remap any of them in your browser's extension settings.

## Install

**Chrome / Edge / Opera** - [Chrome Web Store](https://chromewebstore.google.com/detail/tabaru/ameinjfiidfphkdbmdhlebibjgafdokc)

**Firefox** - latest `.xpi` from [GitHub Releases](https://github.com/echosonusharma/tabaru/releases/latest)

## Build from source

```bash
npm install
npm run dev <chrome|firefox|edge|opera>     # dev with hot reload
npm run build <chrome|firefox|edge|opera>   # production build
```

Output lands in `dist/<browser>`.

## License

[GPL-3.0](LICENSE)

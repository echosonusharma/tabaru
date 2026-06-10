<p align="center">
  <img src="app/images/tabaru-icon.svg" width="128" height="128" alt="Tabaru Icon">
</p>

<h1 align="center">Tabaru</h1>

<p align="center">
  <b>Tabaru</b> is a lightweight browser extension for efficient tab management. Quick navigation, fuzzy search, bookmarks, and auto tab groups — all keyboard-driven.
</p>

## Features

**Tab Search & Navigation**
- Fuzzy search across all open tabs, windows, and recently closed tabs.
- Switch to any tab or restore recently closed tabs from the search overlay.
- Cycle through tabs and windows with keyboard shortcuts.
- Kill the current tab with a shortcut.

**Commands** (type `!` to trigger)
- `!s <query>` — web search or navigate to a domain.
- `!b <query>` — fuzzy search bookmarks, grouped by folder.

**Auto Tab Groups** *(Chrome / Edge / Opera only)*
- URL pattern rules (e.g. `https://*.github.com/*`) auto-group matching tabs.
- Configurable group title, color, and collapsed state per rule.

**New Tab Page**
- Wallpaper providers: solid color, gradient, or random photo (Picsum).
- Widgets: clock (12h/24h), greeting, weather, quick access links.
- Weather from Open-Meteo or wttr.in with animated weather effects.

**General**
- Theme selector (Tabaru, Forest, Mocha, Midnight).
- Inline content-script overlay — no popup required.
- Cross-browser: Chrome, Firefox, Edge, Opera.



## Suggested Keyboard Shortcuts

- Open Search Modal: `Alt+Q`
- Next Tab: `Alt+X`
- Previous Tab: `Alt+Z`

*Note: You can customize these shortcuts in your browser's extension settings.*

## Installation and Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

Run the extension in development mode with hot-reloading:

```bash
npm run dev chrome
npm run dev firefox
npm run dev edge
npm run dev opera
```

Each command writes its unpacked extension files to `dist/<browser>`, for example `dist/firefox` or `dist/edge`.

## Build

Compile the extension for production:

```bash
npm run build chrome
npm run build firefox
npm run build edge
npm run build opera
```

Production builds are also written to `dist/<browser>` so each browser keeps a separate on-disk build directory.

## Release

Trigger the automated versioning and release process:

```bash
npm run release
```

## Acknowledgements

- Built with [WebExtension Toolbox](https://github.com/webextension-toolbox/webextension-toolbox)
- Icons created with help of [App Icon Maker](https://appiconmaker.co/)
- Inspired by the [Shortkeys Extension](https://github.com/crittermike/shortkeys)

## Privacy

Please see our [Privacy Policy](PRIVACY_POLICY.md) for details on permissions and data handling.

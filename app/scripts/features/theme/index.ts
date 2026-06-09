import { Store } from "../../utils";
import { StoreType } from "../../types";

export type ThemeId = 'tabaru' | 'forest' | 'mocha' | 'midnight';

export interface Theme {
  id: ThemeId;
  name: string;
  accent: string;
  bg: string;
  rootVars: Record<string, string>;
  contentVars: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: 'tabaru',
    name: 'Tabaru',
    accent: '#cfa738',
    bg: '#1a1912',
    rootVars: {
      '--color-bg': '#1a1912',
      '--color-bg-secondary': '#5a5040',
      '--color-accent': '#cfa738',
      '--color-accent-rgb': '207, 167, 56',
      '--color-accent-hover': '#e0bc4a',
      '--color-accent-light': '#fff3cd',
      '--color-fg': '#f0e6c0',
      '--color-fg-rgb': '240, 230, 192',
      '--color-sidebar': '#100f0a',
      '--color-panel': '#1e1c14',
      '--color-border': '#2e2a1e',
      '--color-border-input': '#4a4030',
      '--color-icon-muted': '#4a4030',
      '--color-toggle-knob': '#100f0a',
    },
    contentVars: {
      '--t-accent-rgb': '207, 167, 56',
      '--t-bar': '#cfa738',
      '--t-modal-bg': 'rgba(22, 20, 14, 0.80)',
      '--t-backdrop-bg': 'rgba(10, 10, 6, 0.6)',
      '--t-fg': '#f0e6c0',
      '--t-fg-rgb': '240, 230, 192',
      '--t-muted-rgb': '90, 80, 64',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    accent: '#a0c030',
    bg: '#111c15',
    rootVars: {
      '--color-bg': '#111c15',
      '--color-bg-secondary': '#527040',
      '--color-accent': '#a0c030',
      '--color-accent-rgb': '160, 192, 48',
      '--color-accent-hover': '#b8d840',
      '--color-accent-light': '#e4f0b8',
      '--color-fg': '#c4d8a0',
      '--color-fg-rgb': '196, 216, 160',
      '--color-sidebar': '#0d1610',
      '--color-panel': '#131e16',
      '--color-border': '#253d28',
      '--color-border-input': '#3a5530',
      '--color-icon-muted': '#3a5530',
      '--color-toggle-knob': '#0d1610',
    },
    contentVars: {
      '--t-accent-rgb': '160, 192, 48',
      '--t-bar': '#a0c030',
      '--t-modal-bg': 'rgba(12, 22, 14, 0.80)',
      '--t-backdrop-bg': 'rgba(0, 8, 2, 0.6)',
      '--t-fg': '#c4d8a0',
      '--t-fg-rgb': '196, 216, 160',
      '--t-muted-rgb': '82, 112, 64',
    },
  },
  {
    id: 'mocha',
    name: 'Mocha',
    accent: '#cba6f7',
    bg: '#1e1e2e',
    rootVars: {
      '--color-bg': '#1e1e2e',
      '--color-bg-secondary': '#585b70',
      '--color-accent': '#cba6f7',
      '--color-accent-rgb': '203, 166, 247',
      '--color-accent-hover': '#d4b8ff',
      '--color-accent-light': '#ede9fe',
      '--color-fg': '#cdd6f4',
      '--color-fg-rgb': '205, 214, 244',
      '--color-sidebar': '#11111b',
      '--color-panel': '#181825',
      '--color-border': '#313244',
      '--color-border-input': '#45475a',
      '--color-icon-muted': '#45475a',
      '--color-toggle-knob': '#11111b',
    },
    contentVars: {
      '--t-accent-rgb': '203, 166, 247',
      '--t-bar': '#cba6f7',
      '--t-modal-bg': 'rgba(24, 24, 37, 0.80)',
      '--t-backdrop-bg': 'rgba(17, 17, 27, 0.6)',
      '--t-fg': '#cdd6f4',
      '--t-fg-rgb': '205, 214, 244',
      '--t-muted-rgb': '88, 91, 112',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    accent: '#58a6ff',
    bg: '#0d1117',
    rootVars: {
      '--color-bg': '#0d1117',
      '--color-bg-secondary': '#30475e',
      '--color-accent': '#58a6ff',
      '--color-accent-rgb': '88, 166, 255',
      '--color-accent-hover': '#79b8ff',
      '--color-accent-light': '#cae8ff',
      '--color-fg': '#c9d1d9',
      '--color-fg-rgb': '201, 209, 217',
      '--color-sidebar': '#0a0d14',
      '--color-panel': '#161b24',
      '--color-border': '#21262d',
      '--color-border-input': '#30475e',
      '--color-icon-muted': '#30475e',
      '--color-toggle-knob': '#0a0d14',
    },
    contentVars: {
      '--t-accent-rgb': '88, 166, 255',
      '--t-bar': '#58a6ff',
      '--t-modal-bg': 'rgba(13, 17, 23, 0.80)',
      '--t-backdrop-bg': 'rgba(5, 8, 14, 0.6)',
      '--t-fg': '#c9d1d9',
      '--t-fg-rgb': '201, 209, 217',
      '--t-muted-rgb': '48, 71, 94',
    },
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'tabaru';

export const themeStore: Store<ThemeId> = new Store("theme", StoreType.LOCAL);

export function getTheme(id: ThemeId | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function buildContentThemeCSS(vars: Record<string, string>): string {
  const declarations = Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ');
  return `:host { ${declarations} }`;
}

export function applyRootTheme(theme: Theme): void {
  const id = 'tabaru-theme-vars';
  let styleEl = document.getElementById(id) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = id;
    document.head.appendChild(styleEl);
  }
  const allVars = { ...theme.rootVars, ...theme.contentVars };
  const declarations = Object.entries(allVars).map(([k, v]) => `${k}: ${v};`).join(' ');
  styleEl.textContent = `:root { ${declarations} }`;
}

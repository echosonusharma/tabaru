import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { searchTabStore } from './core';
import { THEMES, ThemeId, themeStore, getTheme, applyRootTheme, DEFAULT_THEME_ID } from '../theme';

export * from './core';

export function GeneralSection() {
  const [searchTab, setSearchTab] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      searchTabStore.get(),
      themeStore.get(),
    ]).then(([searchTabVal, themeVal]) => {
      setSearchTab(!!searchTabVal);
      const tid = (themeVal ?? DEFAULT_THEME_ID) as ThemeId;
      setCurrentTheme(tid);
      applyRootTheme(getTheme(tid));
      setReady(true);
    });
  }, []);

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const next = target.checked;
    setSearchTab(next);
    await searchTabStore.set(next);
  };

const handleThemeChange = async (id: ThemeId) => {
    setCurrentTheme(id);
    const theme = getTheme(id);
    applyRootTheme(theme);
    await themeStore.set(id);
  };

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">General</h1>
        <p class="settings-section-subtitle">Core behavior for tab search and navigation.</p>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-text">
            <span class="settings-row-label">Theme</span>
            <span class="settings-row-hint">Color scheme for the extension.</span>
          </div>
          <div class="theme-picker">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                class={`theme-swatch${currentTheme === theme.id ? ' active' : ''}`}
                style={{ background: theme.accent }}
                onClick={() => handleThemeChange(theme.id)}
                title={theme.name}
                disabled={!ready}
              >
                <span class="theme-swatch-check">✓</span>
              </button>
            ))}
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-text">
            <span class="settings-row-label">Search Tab overlay</span>
            <span class="settings-row-hint">Opens the search modal on the active page instead of the popup.</span>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              checked={searchTab}
              disabled={!ready}
              onChange={handleSearchTabChange}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

      </div>
    </Fragment>
  );
}

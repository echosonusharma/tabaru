import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { searchTabStore } from './core';

export * from './core';

export function GeneralSection() {
  const [searchTab, setSearchTab] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    searchTabStore.get().then((val) => {
      setSearchTab(!!val);
      setReady(true);
    });
  }, []);

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const next = target.checked;
    setSearchTab(next);
    await searchTabStore.set(next);
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

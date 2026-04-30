import { h, render, Fragment, VNode } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { ShortcutsIcon, ShortcutsSection } from "./features/shortcuts";
import { TabGroupsIcon, TabGroupsSection } from "./features/auto_tab_group";
import { GeneralSection } from "./features/search_navigation";
import '../styles/settings.css';

type SectionId = 'general' | 'shortcuts' | 'tab-groups' | 'about';

const GeneralIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const AboutIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);


const NAV_SECTIONS: { id: SectionId; label: string; Icon: () => VNode }[] = [
  { id: 'general', label: 'General', Icon: GeneralIcon },
  { id: 'shortcuts', label: 'Shortcuts', Icon: ShortcutsIcon },
  { id: 'tab-groups', label: 'Tab Groups', Icon: TabGroupsIcon },
  { id: 'about', label: 'About', Icon: AboutIcon },
];

function AboutSection() {
  const manifest = browser.runtime.getManifest();

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">About</h1>
        <p class="settings-section-subtitle">Tabaru - quick and simple tab management.</p>
      </div>

      <div class="settings-group">
        <ul class="about-list">
          <li><span>Version</span><span>{manifest.version}</span></li>
          <li><span>Author</span><span>{manifest.author as string || 'Sonu Sharma'}</span></li>
          <li>
            <span>Source</span>
            <a href="https://github.com/echosonusharma/tabaru" target="_blank" rel="noopener noreferrer">github.com/echosonusharma/tabaru</a>
          </li>
          <li>
            <span>Privacy Policy</span>
            <a href="https://github.com/echosonusharma/tabaru/blob/main/PRIVACY_POLICY.md" target="_blank" rel="noopener noreferrer">View privacy policy</a>
          </li>
        </ul>
      </div>
    </Fragment>
  );
}

function SettingsApp() {
  const [active, setActive] = useState<SectionId>(() => {
    const hash = window.location.hash.replace('#', '') as SectionId;
    return NAV_SECTIONS.some((s) => s.id === hash) ? hash : 'general';
  });

  useEffect(() => {
    window.location.hash = active;
    document.title = `Tabaru — ${NAV_SECTIONS.find((s) => s.id === active)?.label}`;
  }, [active]);

  const manifest = browser.runtime.getManifest();

  return (
    <div class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-brand">
          <img class="settings-brand-icon" src={browser.runtime.getURL("images/tabaru-icon.svg")} alt="" />
          <span class="settings-brand-name">Tabaru</span>
          <span class="settings-brand-version">v{manifest.version}</span>
        </div>
        {NAV_SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            class={active === id ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setActive(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </aside>

      <main class="settings-content">
        {active === 'general' && <GeneralSection />}
        {active === 'shortcuts' && <ShortcutsSection />}
        {active === 'tab-groups' && <TabGroupsSection />}
        {active === 'about' && <AboutSection />}
      </main>
    </div>
  );
}

const app = document.getElementById('app');
if (app) {
  render(<SettingsApp />, app as Element);
}

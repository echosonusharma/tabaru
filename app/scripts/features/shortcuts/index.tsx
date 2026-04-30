import browser from "webextension-polyfill";
import { getShortcutsPageUrl, logger } from "../../utils";
import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import '../../../styles/settings.css';

export async function checkAndPromptShortcuts(): Promise<void> {
    try {
        const commands = await browser.commands.getAll();
        const missingShortcuts = commands.filter(
            (cmd) => cmd.name !== "_execute_action" && cmd.name !== "_execute_browser_action" && !cmd.shortcut
        );

        if (missingShortcuts.length > 0) {
            // Cannot force set keys, prompt user by opening the extensions shortcut page
            await openShortcutSettings();
        }
    } catch (error) {
        logger(`Error checking shortcuts:`, error);
    }
}

async function openShortcutSettings(): Promise<void> {
    const url = getShortcutsPageUrl();

    try {
        await browser.tabs.create({ url });
        return;
    } catch (e) {
        logger("Error opening shortcuts page programmatically", e);
    }

    try {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    } catch (e) {
        logger("Error opening shortcuts page via window.open", e);
    }

    try {
        window.location.href = url;
    } catch (e) {
        logger("Error navigating to shortcuts page", e);
    }
}


export const ShortcutsIcon = () => (
    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 17h8" />
        <path d="M10 13h4" />
    </svg>
);


export function ShortcutsSection() {
    const [shortcuts, setShortcuts] = useState<browser.Commands.Command[]>([]);

    useEffect(() => {
        browser.commands.getAll().then((cmds) => {
            setShortcuts(
                cmds.filter((c) => c.name && c.name !== '_execute_action' && c.name !== '_execute_browser_action')
            );
        });
    }, []);

    const hasMissing = shortcuts.some((s) => !s.shortcut);

    return (
        <Fragment>
            <div class="settings-section-header">
                <h1 class="settings-section-title">Shortcuts</h1>
                <p class="settings-section-subtitle">Keyboard bindings are managed by your browser.</p>
            </div>

            <div class="settings-group">
                <table class="shortcut-table">
                    <tbody>
                        {shortcuts.map((s) => (
                            <tr key={s.name}>
                                <td>{s.description || s.name}</td>
                                <td>
                                    <kbd class={s.shortcut ? '' : 'missing'}>{s.shortcut || 'Unassigned'}</kbd>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div class="settings-footer-actions">
                <button class="btn primary" onClick={openShortcutSettings}>
                    {hasMissing ? 'Assign missing shortcuts' : 'Edit shortcuts in browser'}
                </button>
            </div>
        </Fragment>
    );
}

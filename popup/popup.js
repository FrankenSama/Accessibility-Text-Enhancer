// popup/popup.js
import {
    isEnabledForOrigin,
    normalizeSiteRules,
    ruleForOrigin,
    siteOrigin
} from '../content-scripts/modules/prefs.js';
import { CONFIG } from '../content-scripts/modules/core.js';

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const statusDiv = document.getElementById('status');
    const currentDomain = document.getElementById('currentDomain');
    const siteRuleSelect = document.getElementById('siteRule');

    // Per-site state for the active tab. The toggle is the global default;
    // the site rule for this origin wins when one is set.
    let origin = null;
    let globalEnabled = true;
    let siteRules = {};

    // Show macOS modifier names in the shortcut list.
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const isMac = /mac/i.test(platform);
    if (isMac) {
        document.querySelectorAll('.shortcut-key').forEach((key) => {
            key.textContent = key.textContent
                .replace('Ctrl', 'Cmd')
                .replace('Alt', 'Option');
        });
    }

    /**
     * Turn a Chrome command shortcut into the label shown in the popup.
     * @param {string} shortcut
     * @returns {string}
     */
    function formatShortcut(shortcut) {
        if (!shortcut) {
            return 'Not set';
        }

        if (isMac) {
            return shortcut
                .replace(/Command/g, 'Cmd')
                .replace(/MacCtrl/g, 'Ctrl')
                .replace(/Alt/g, 'Option');
        }

        return shortcut.replace(/Command/g, 'Ctrl');
    }

    // Manifest commands can be rebound at chrome://extensions/shortcuts, so
    // show the binding the user actually has instead of the suggested one.
    chrome.commands.getAll((commands) => {
        if (chrome.runtime.lastError || !commands) {
            return;
        }

        commands.forEach((command) => {
            const key = document.querySelector(
                `.shortcut-key[data-command="${command.name}"]`
            );

            if (key) {
                key.textContent = formatShortcut(command.shortcut);
            }
        });
    });

    // Chrome blocks chrome:// links in extension pages, so open the shortcut
    // manager through the tabs API.
    document.getElementById('manageShortcuts').addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }, () => {
            window.close();
        });
    });

    // Reading settings live on their own page so they are reachable without
    // selecting text first, including on pages where content scripts cannot run.
    document.getElementById('openSettings').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });

    /**
     * The effective state for this tab: the site rule wins over the global
     * switch.
     * @returns {boolean}
     */
    function effectiveEnabled() {
        return isEnabledForOrigin(globalEnabled, siteRules, origin);
    }

    /**
     * Update the status line, naming the site rule when one is in effect.
     */
    function updateStatus() {
        const isEnabled = effectiveEnabled();
        const rule = ruleForOrigin(siteRules, origin);

        statusDiv.textContent = isEnabled ? '✓ Active' : '✗ Disabled';

        if (rule) {
            statusDiv.textContent += rule === 'on'
                ? ' — always on here'
                : ' — always off here';
        }

        statusDiv.classList.toggle('active', isEnabled);
        statusDiv.classList.toggle('disabled', !isEnabled);
    }

    /**
     * Mirror the site rule into the select.
     */
    function syncSiteRuleControl() {
        siteRuleSelect.disabled = !origin;
        siteRuleSelect.value = origin
            ? (ruleForOrigin(siteRules, origin) || '')
            : '';
    }

    // Show the active tab's hostname (when available) and its site rule.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab) {
            return;
        }

        try {
            const url = new URL(tab.url);
            currentDomain.textContent = url.hostname || 'N/A';
            origin = siteOrigin(url);
        } catch {
            currentDomain.textContent = 'N/A';
            origin = null;
        }

        siteRuleSelect.disabled = !origin;

        chrome.storage.sync.get(['siteRules'], (result) => {
            if (chrome.runtime.lastError) {
                return;
            }
            siteRules = normalizeSiteRules(result.siteRules);
            syncSiteRuleControl();
            updateStatus();
        });
    });

    // Load the shared enabled state.
    chrome.storage.local.get(['extensionEnabled'], (result) => {
        // A failed read leaves the switch on its default rather than
        // stranding the popup on "Loading...".
        globalEnabled = chrome.runtime.lastError
            ? true
            : result.extensionEnabled !== false;
        toggle.checked = globalEnabled;
        updateStatus();
    });

    // The content scripts listen for storage changes, so saving the value is
    // enough to enable/disable the extension everywhere.
    toggle.addEventListener('change', () => {
        globalEnabled = toggle.checked;
        updateStatus();
        chrome.storage.local.set({ extensionEnabled: globalEnabled });
    });

    // "Use global setting" removes the rule; otherwise store this origin.
    siteRuleSelect.addEventListener('change', () => {
        if (!origin) {
            return;
        }

        const rules = normalizeSiteRules(siteRules);
        const adding = siteRuleSelect.value === 'on' || siteRuleSelect.value === 'off';

        // normalizeSiteRules caps the stored list, so refuse a new origin
        // instead of saving a rule that would be dropped on the next load.
        if (adding &&
            !Object.prototype.hasOwnProperty.call(rules, origin) &&
            Object.keys(rules).length >= CONFIG.maxSiteRules) {
            syncSiteRuleControl();
            updateStatus();
            statusDiv.textContent = `Site rule limit reached (${CONFIG.maxSiteRules})`;
            return;
        }

        if (adding) {
            rules[origin] = siteRuleSelect.value;
        } else {
            delete rules[origin];
        }

        chrome.storage.sync.set({ siteRules: rules }, () => {
            if (chrome.runtime.lastError) {
                // Storage.sync can reject a write, for example when the
                // per-item quota is full. Keep the control on the stored
                // value so it does not claim a rule that was not saved.
                syncSiteRuleControl();
                updateStatus();
                statusDiv.textContent = 'Could not save this site rule';
                return;
            }

            siteRules = rules;
            updateStatus();
        });
    });

    // Keep the popup in sync if the state changes from a keyboard shortcut
    // or another popup.
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.extensionEnabled) {
            globalEnabled = changes.extensionEnabled.newValue !== false;
            toggle.checked = globalEnabled;
            updateStatus();
            return;
        }

        if (areaName === 'sync' && changes.siteRules) {
            siteRules = normalizeSiteRules(changes.siteRules.newValue);
            syncSiteRuleControl();
            updateStatus();
        }
    });
});

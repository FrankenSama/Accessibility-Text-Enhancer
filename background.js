// background.js

const BADGE_COLOR_ON = '#4CAF50';
const BADGE_COLOR_OFF = '#F44336';
const PREFERENCE_KEYS = ['darkMode', 'ttsVoice', 'ttsRate', 'ttsPitch'];

/**
 * The effective on/off state for a URL, taking the site rule into account.
 * @param {boolean} globalEnabled
 * @param {Object<string, 'on'|'off'>} siteRules
 * @param {string|undefined} url
 * @returns {boolean}
 */
function isEnabledForUrl(globalEnabled, siteRules, url) {
    if (!url) {
        return globalEnabled;
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return globalEnabled;
        }

        const rule = siteRules[parsed.origin];
        if (rule === 'on') {
            return true;
        }
        if (rule === 'off') {
            return false;
        }
    } catch {
        // A URL the browser cannot parse has no site rule.
    }

    return globalEnabled;
}

/**
 * Read the state every badge depends on once, instead of per tab.
 * @param {(state: {globalEnabled: boolean, siteRules: Object}) => void} callback
 */
function readBadgeState(callback) {
    chrome.storage.local.get(['extensionEnabled'], (local) => {
        chrome.storage.sync.get(['siteRules'], (synced) => {
            callback({
                globalEnabled: (local || {}).extensionEnabled !== false,
                siteRules: (synced || {}).siteRules || {}
            });
        });
    });
}

/**
 * Paint the badge for one tab. A disabled tab shows OFF, including when a
 * site rule turned the extension off only for that origin.
 * @param {number} tabId
 * @param {string|undefined} url
 * @param {{globalEnabled: boolean, siteRules: Object}} state
 */
function paintBadge(tabId, url, state) {
    const isEnabled = isEnabledForUrl(
        state.globalEnabled,
        state.siteRules,
        url
    );
    const color = isEnabled ? BADGE_COLOR_ON : BADGE_COLOR_OFF;

    chrome.action.setBadgeText({ tabId, text: isEnabled ? '' : 'OFF' });
    chrome.action.setBadgeBackgroundColor({ tabId, color });
}

/**
 * Refresh one tab's badge, for example after it finishes navigating.
 * @param {number} tabId
 * @param {string|undefined} url
 */
function refreshBadgeForTab(tabId, url) {
    readBadgeState((state) => paintBadge(tabId, url, state));
}

/**
 * Refresh every open tab after a preference or site-rule change.
 */
function refreshAllBadges() {
    readBadgeState((state) => {
        chrome.tabs.query({}, (tabs) => {
            (tabs || []).forEach((tab) => {
                if (typeof tab.id === 'number') {
                    paintBadge(tab.id, tab.url, state);
                }
            });
        });
    });
}

/**
 * Move pre-1.4.0 preferences from storage.local to storage.sync. Values that
 * are already in sync win, so running this twice is harmless.
 * @param {() => void} callback
 */
function migratePreferences(callback) {
    chrome.storage.sync.get(PREFERENCE_KEYS, (synced) => {
        chrome.storage.local.get(PREFERENCE_KEYS, (legacy) => {
            const updates = {};

            for (const key of PREFERENCE_KEYS) {
                if (synced[key] === undefined && legacy[key] !== undefined) {
                    updates[key] = legacy[key];
                }
            }

            // The toolbar defaults to dark when no preference was ever saved.
            if (synced.darkMode === undefined && updates.darkMode === undefined) {
                updates.darkMode = true;
            }

            const legacyKeys = PREFERENCE_KEYS.filter(
                (key) => legacy[key] !== undefined
            );

            const removeLegacy = () => {
                if (legacyKeys.length > 0) {
                    chrome.storage.local.remove(legacyKeys, () => callback());
                } else {
                    callback();
                }
            };

            if (Object.keys(updates).length > 0) {
                chrome.storage.sync.set(updates, () => {
                    // A failed write leaves the old values in place so the
                    // next start can retry the migration.
                    if (chrome.runtime.lastError) {
                        callback();
                    } else {
                        removeLegacy();
                    }
                });
            } else {
                removeLegacy();
            }
        });
    });
}

// Set default values on install/update and show the project page on first install.
chrome.runtime.onInstalled.addListener((details) => {
    migratePreferences(() => {
        chrome.storage.local.get(['extensionEnabled'], (result) => {
            if (result.extensionEnabled === undefined) {
                chrome.storage.local.set({ extensionEnabled: true });
            }
            refreshAllBadges();
        });
    });

    if (details.reason === 'install') {
        chrome.tabs.create({
            url: 'https://github.com/FrankenSama/accessibility-text-enhancer'
        });
    }
});

/**
 * Convert a Chrome command shortcut to the ARIA keyshortcuts syntax.
 * @param {string} shortcut
 * @returns {string}
 */
function toAriaShortcut(shortcut) {
    if (!shortcut) {
        return '';
    }

    return shortcut
        .replace('Command', 'Meta')
        .replace('MacCtrl', 'Control')
        .replace('Ctrl', 'Control')
        .replace('Option', 'Alt');
}

/**
 * Read every command and its current binding.
 * @param {(shortcuts: Object<string, {shortcut: string, aria: string}>) => void} callback
 */
function readShortcuts(callback) {
    chrome.commands.getAll((commands) => {
        if (chrome.runtime.lastError || !commands) {
            callback({});
            return;
        }

        const shortcuts = {};

        commands.forEach((command) => {
            const shortcut = command.shortcut || '';
            shortcuts[command.name] = {
                shortcut,
                aria: toAriaShortcut(shortcut)
            };
        });

        callback(shortcuts);
    });
}

// Handle keyboard shortcuts. The content script reacts to storage changes,
// so toggling only needs to update the shared state.
chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-extension') {
        chrome.storage.local.get(['extensionEnabled'], (result) => {
            chrome.storage.local.set({
                extensionEnabled: result.extensionEnabled === false
            });
        });
        return;
    }

    if (command !== 'focus-toolbar') {
        return;
    }

    // Focus Toolbar is a manifest command, so Chrome owns the key binding and
    // the user can change it at chrome://extensions/shortcuts. Relay it to the
    // content script, which knows whether a selection exists and whether the
    // user is typing.
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tabId = tabs[0] && tabs[0].id;
        if (typeof tabId !== 'number') {
            return;
        }

        chrome.tabs.sendMessage(tabId, { type: 'focus-toolbar' }, () => {
            // Pages without a content script (chrome://, the Web Store, PDFs)
            // reject the message; reading lastError keeps the log clean.
            void chrome.runtime.lastError;
        });
    });
});

// Let the content script announce the shortcuts the user actually has bound.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'get-shortcuts') {
        return false;
    }

    readShortcuts((shortcuts) => sendResponse({ shortcuts }));
    return true;
});

// Keep the badge in sync with the enabled state and site rules. A site rule
// only affects its own tab, so refresh every tab when the rules change.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName === 'local' && changes.extensionEnabled) ||
        (areaName === 'sync' && changes.siteRules)) {
        refreshAllBadges();
    }
});

// Recompute the badge when the user switches or navigates tabs.
chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
            refreshBadgeForTab(tabId, tab.url);
        }
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
        refreshBadgeForTab(tabId, tab.url);
    }
});

// Initialize the badge when the service worker starts.
refreshAllBadges();

// background.js

const BADGE_COLOR_ON = '#4CAF50';
const BADGE_COLOR_OFF = '#F44336';

/**
 * Update the extension badge to reflect the enabled state.
 * @param {boolean} isEnabled
 */
function updateBadge(isEnabled) {
    chrome.action.setBadgeText({ text: isEnabled ? '' : 'OFF' });
    chrome.action.setBadgeBackgroundColor({
        color: isEnabled ? BADGE_COLOR_ON : BADGE_COLOR_OFF
    });
}

/**
 * Read the current enabled state and pass it to a callback.
 * @param {(isEnabled: boolean) => void} callback
 */
function readEnabledState(callback) {
    chrome.storage.local.get(['extensionEnabled'], (result) => {
        callback(result.extensionEnabled !== false);
    });
}

// Set default values on install/update and show the project page on first install.
chrome.runtime.onInstalled.addListener((details) => {
    chrome.storage.local.get(['extensionEnabled', 'darkMode'], (result) => {
        const updates = {};

        if (result.extensionEnabled === undefined) {
            updates.extensionEnabled = true;
        }
        if (result.darkMode === undefined) {
            updates.darkMode = true;
        }
        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates);
        }

        updateBadge(result.extensionEnabled !== false);
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
        readEnabledState((isEnabled) => {
            chrome.storage.local.set({ extensionEnabled: !isEnabled });
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

// Keep the badge in sync with the enabled state.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.extensionEnabled) {
        return;
    }

    updateBadge(changes.extensionEnabled.newValue !== false);
});

// Initialize the badge when the service worker starts.
readEnabledState(updateBadge);

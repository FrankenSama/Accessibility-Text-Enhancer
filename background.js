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

// Handle keyboard shortcuts. The content script reacts to storage changes,
// so toggling only needs to update the shared state.
chrome.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-extension') {
        return;
    }

    readEnabledState((isEnabled) => {
        chrome.storage.local.set({ extensionEnabled: !isEnabled });
    });
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

// popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const statusDiv = document.getElementById('status');
    const currentDomain = document.getElementById('currentDomain');

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

    // Show the active tab's hostname (when available).
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
            return;
        }

        try {
            const url = new URL(tabs[0].url);
            currentDomain.textContent = url.hostname || 'N/A';
        } catch {
            currentDomain.textContent = 'N/A';
        }
    });

    // Load the shared enabled state.
    chrome.storage.local.get(['extensionEnabled'], (result) => {
        const isEnabled = result.extensionEnabled !== false;
        toggle.checked = isEnabled;
        updateStatus(isEnabled);
    });

    // The content scripts listen for storage changes, so saving the value is
    // enough to enable/disable the extension everywhere.
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        updateStatus(isEnabled);
        chrome.storage.local.set({ extensionEnabled: isEnabled });
    });

    // Keep the popup in sync if the state changes from a keyboard shortcut.
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.extensionEnabled) {
            return;
        }

        const isEnabled = changes.extensionEnabled.newValue !== false;
        toggle.checked = isEnabled;
        updateStatus(isEnabled);
    });

    /**
     * Update status display.
     * @param {boolean} isEnabled - Whether the extension is enabled.
     */
    function updateStatus(isEnabled) {
        statusDiv.textContent = isEnabled ? '✓ Active' : '✗ Disabled';
        statusDiv.classList.toggle('active', isEnabled);
        statusDiv.classList.toggle('disabled', !isEnabled);
    }
});

// popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const statusDiv = document.getElementById('status');
    const currentDomain = document.getElementById('currentDomain');

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
        statusDiv.style.background = isEnabled
            ? 'rgba(76, 175, 80, 0.3)'
            : 'rgba(244, 67, 54, 0.3)';
    }
});

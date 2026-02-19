// popup/popup.js
document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('toggle');
    const statusDiv = document.getElementById('status');
    const currentDomain = document.getElementById('currentDomain');

    // Get current tab information and inject content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            try {
                const url = new URL(tabs[0].url);
                currentDomain.textContent = url.hostname || 'N/A';
            } catch (e) {
                currentDomain.textContent = 'N/A';
            }
            
            // Inject content script when popup opens
            injectContentScript(tabs[0].id);
        }
    });

    // Retrieve and apply saved extension state
    chrome.storage.local.get(['extensionEnabled', 'sessionStats'], function(result) {
        const isEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
        toggle.checked = isEnabled;
        updateStatus(isEnabled);
    });

    // Handle toggle changes
    toggle.addEventListener('change', function() {
        const isEnabled = this.checked;
        updateStatus(isEnabled);

        // Save state
        chrome.storage.local.set({ extensionEnabled: isEnabled });

        // Send enable/disable state to content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "setEnabled",
                    value: isEnabled
                }).catch(err => {
                    console.log('Content script not ready, injecting first...');
                    // If content script isn't ready, inject it and then send message
                    injectContentScript(tabs[0].id).then(() => {
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: "setEnabled",
                                value: isEnabled
                            }).catch(e => console.log('Still failed:', e));
                        }, 100);
                    });
                });
            }
        });
    });

    /**
     * Inject content script into tab
     * @param {number} tabId - The tab ID
     * @returns {Promise}
     */
    function injectContentScript(tabId) {
        return new Promise((resolve, reject) => {
            if (chrome.scripting) {
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content-scripts/content.js']
                }).then(() => {
                    console.log('Content script injected successfully');
                    // Also inject CSS
                    return chrome.scripting.insertCSS({
                        target: { tabId: tabId },
                        files: ['content-scripts/content.css']
                    });
                }).then(() => {
                    console.log('Content CSS injected successfully');
                    resolve();
                }).catch(err => {
                    console.log('Error injecting content script:', err.message);
                    // Script might already be injected, which is fine
                    resolve(); // Resolve anyway
                });
            } else {
                reject(new Error('Scripting API not available'));
            }
        });
    }

    /**
     * Update status display
     * @param {boolean} isEnabled - Whether extension is enabled
     */
    function updateStatus(isEnabled) {
        statusDiv.textContent = isEnabled ? '✓ Active' : '✗ Disabled';
        statusDiv.style.background = isEnabled 
            ? 'rgba(76, 175, 80, 0.3)' 
            : 'rgba(244, 67, 54, 0.3)';
    }

    // Listen for stat updates
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (changes.sessionStats) {
            const stats = changes.sessionStats.newValue;
            // Optional: You could display this somewhere else
            console.log('Stats updated:', stats);
        }
    });
});
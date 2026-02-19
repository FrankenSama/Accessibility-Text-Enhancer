// popup/popup.js
document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('toggle');
    const statusDiv = document.getElementById('status');
    const enhancementCount = document.getElementById('enhancementCount');
    const currentDomain = document.getElementById('currentDomain');

    // Get current tab information and inject content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            const url = new URL(tabs[0].url);
            currentDomain.textContent = url.hostname || 'N/A';
            
            // Check if scripting API is available
            if (chrome.scripting) {
                // Inject content script when popup opens (user gesture)
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['content-scripts/content.js']
                }).catch(err => {
                    console.log('Error injecting content script:', err);
                    // Fallback: Try using executeScript on the action
                    chrome.action.executeScript({
                        tabId: tabs[0].id,
                        files: ['content-scripts/content.js']
                    }).catch(fallbackErr => {
                        console.log('Fallback also failed:', fallbackErr);
                    });
                });
            } else {
                console.log('Scripting API not available');
            }
        }
    });

    // Retrieve and apply saved extension state
    chrome.storage.local.get(['extensionEnabled', 'sessionStats'], function(result) {
        const isEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
        toggle.checked = isEnabled;
        updateStatus(isEnabled);

        // Update statistics
        if (result.sessionStats) {
            if (enhancementCount) enhancementCount.textContent = result.sessionStats.totalEnhancements || 0;
        }
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
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.log('Content script not ready yet');
                    }
                });
            }
        });
    });

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
            if (stats && enhancementCount) {
                enhancementCount.textContent = stats.totalEnhancements || 0;
            }
        }
    });
});
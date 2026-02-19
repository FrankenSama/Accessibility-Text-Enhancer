// background.js

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Accessibility Text Enhancer installed/updated');
    
    // Set default values
    chrome.storage.local.get(['extensionEnabled', 'darkMode', 'sessionStats'], (result) => {
        if (result.extensionEnabled === undefined) {
            chrome.storage.local.set({ extensionEnabled: true });
        }
        if (result.darkMode === undefined) {
            chrome.storage.local.set({ darkMode: true });
        }
        if (!result.sessionStats) {
            chrome.storage.local.set({ 
                sessionStats: {
                    totalEnhancements: 0,
                    sessionStart: Date.now()
                }
            });
        }
    });

    // Show welcome page on first install
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: 'https://github.com/FrankenSama/accessibility-text-enhancer'
        });
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // User clicked the extension icon - inject content script
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js']
    }).catch(err => {
        console.log('Error injecting content script:', err);
    });
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    console.log('Command received:', command);
    
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
            // First inject the content script if needed
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ['content-scripts/content.js']
            }).then(() => {
                // Then send the command based on the shortcut
                switch(command) {
                    case 'toggle-extension':
                        toggleExtension(tabs[0].id);
                        break;
                    case 'increase-size':
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "executeCommand",
                            command: "undo"
                        });
                        break;
                    case 'decrease-size':
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "executeCommand",
                            command: "redo"
                        });
                        break;
                }
            }).catch(err => {
                console.log('Content script already injected or error:', err);
                // Still try to send the message
                switch(command) {
                    case 'toggle-extension':
                        toggleExtension(tabs[0].id);
                        break;
                    case 'increase-size':
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "executeCommand",
                            command: "undo"
                        });
                        break;
                    case 'decrease-size':
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "executeCommand",
                            command: "redo"
                        });
                        break;
                }
            });
        }
    });
});

/**
 * Toggle extension on/off
 * @param {number} tabId - The tab ID
 */
function toggleExtension(tabId) {
    chrome.storage.local.get(['extensionEnabled'], (result) => {
        const newState = !result.extensionEnabled;
        chrome.storage.local.set({ extensionEnabled: newState });
        
        chrome.tabs.sendMessage(tabId, {
            action: "setEnabled",
            value: newState
        });
    });
}

// Track usage statistics
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'incrementStats') {
        chrome.storage.local.get(['sessionStats'], (result) => {
            const stats = result.sessionStats || { totalEnhancements: 0 };
            stats.totalEnhancements = (stats.totalEnhancements || 0) + 1;
            stats.lastEnhancement = Date.now();
            
            chrome.storage.local.set({ sessionStats: stats });
        });
    }
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension started');
});

// Set badge text based on extension state
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.extensionEnabled) {
        const isEnabled = changes.extensionEnabled.newValue;
        chrome.action.setBadgeText({
            text: isEnabled ? '' : 'OFF'
        });
        chrome.action.setBadgeBackgroundColor({
            color: isEnabled ? '#4CAF50' : '#F44336'
        });
    }
});
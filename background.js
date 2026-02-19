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

// NEW: Inject content script when a page finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Check if the page has finished loading
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        // Only inject if extension is enabled (check storage)
        chrome.storage.local.get(['extensionEnabled'], (result) => {
            if (result.extensionEnabled !== false) { // Default to true if not set
                injectContentScript(tabId);
            }
        });
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // User clicked the extension icon - inject content script
    injectContentScript(tab.id);
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    console.log('Command received:', command);
    
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
            // First inject the content script if needed
            injectContentScript(tabs[0].id).then(() => {
                // Then send the command
                sendCommandToContent(tabs[0].id, command);
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
    return chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content-scripts/content.js']
    }).then(() => {
        return chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['content-scripts/content.css']
        });
    }).catch(err => {
        // This error is expected if script is already injected
        console.log('Injection info (may already be injected):', err.message);
    });
}

/**
 * Send command to content script
 * @param {number} tabId - The tab ID
 * @param {string} command - The command to send
 */
function sendCommandToContent(tabId, command) {
    let action = '';
    
    // Map commands to actions
    switch(command) {
        case 'toggle-extension':
            toggleExtension(tabId);
            return;
        case 'toggle-bold':
            action = 'bold';
            break;
        case 'toggle-highlight':
            action = 'highlight';
            break;
        case 'increase-size':
            action = 'sizeUp';
            break;
        case 'decrease-size':
            action = 'sizeDown';
            break;
        case 'undo-change':
            action = 'undo';
            break;
        case 'redo-change':
            action = 'redo';
            break;
        default:
            console.log('Unknown command:', command);
            return;
    }
    
    chrome.tabs.sendMessage(tabId, {
        action: "executeCommand",
        command: action
    }).catch(err => {
        console.log('Error sending command:', err);
    });
}

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
        }).catch(err => {
            console.log('Error toggling extension:', err);
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
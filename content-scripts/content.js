// content-scripts/content.js
(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.__accessibilityEnhancerInitialized) return;
    window.__accessibilityEnhancerInitialized = true;

    // ==================== STATE MANAGEMENT ====================
    
    const STATE = {
        currentSelection: null,
        isExtensionEnabled: true,
        currentFontStyle: 'sans-serif',
        isDarkMode: true,
        history: [],
        historyIndex: -1,
        currentDomain: window.location.hostname,
        siteSettings: {},
        toolbarTimeout: null
    };

    const CONFIG = {
        toolbarId: 'accessibility-toolbar',
        settingsPanelId: 'accessibility-settings-panel',
        settingsOverlayId: 'accessibility-settings-overlay',
        selectionDelay: 150,
        toastDuration: 2000,
        maxHistorySize: 50,
        fontSizeMin: 8,
        fontSizeMax: 50
    };

    // ==================== INITIALIZATION ====================

    /**
     * Initialize extension on page load
     */
    async function initialize() {
        try {
            await loadExtensionState();
            await loadSiteSettings();
            setupEventListeners();
            setupKeyboardShortcuts();
            console.log('Accessibility Text Enhancer initialized');
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    /**
     * Load saved extension state from storage
     */
    async function loadExtensionState() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['extensionEnabled', 'darkMode', 'siteSettings'], (result) => {
                STATE.isExtensionEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
                STATE.isDarkMode = result.darkMode !== undefined ? result.darkMode : true;
                STATE.siteSettings = result.siteSettings || {};
                
                if (!STATE.isExtensionEnabled) {
                    removeToolbar();
                }
                resolve();
            });
        });
    }

    /**
     * Load site-specific settings
     */
    async function loadSiteSettings() {
        const settings = STATE.siteSettings[STATE.currentDomain];
        if (settings) {
            console.log('Loaded settings for', STATE.currentDomain, settings);
            // Apply saved settings if auto-apply is enabled
        }
    }

    /**
     * Save current settings for this domain
     */
    function saveSiteSettings(settings) {
        STATE.siteSettings[STATE.currentDomain] = {
            ...STATE.siteSettings[STATE.currentDomain],
            ...settings,
            lastUpdated: Date.now()
        };
        
        chrome.storage.local.set({ siteSettings: STATE.siteSettings });
        showToast('Settings saved for this website');
    }

    // ==================== MESSAGE HANDLERS ====================

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "setEnabled") {
            STATE.isExtensionEnabled = request.value;
            chrome.storage.local.set({ extensionEnabled: STATE.isExtensionEnabled });
            if (!STATE.isExtensionEnabled) {
                removeToolbar();
                showToast('Extension disabled');
            } else {
                showToast('Extension enabled');
            }
            sendResponse({ status: "success" });
        }
        else if (request.action === "executeCommand") {
            handleCommand(request.command);
            sendResponse({ status: "success" });
        }
        return true;
    });

    // ==================== TOOLBAR MANAGEMENT ====================

    /**
     * Creates and returns the enhanced toolbar element
     * @returns {HTMLElement|null} The created toolbar element
     */
    function createToolbar() {
        if (!STATE.isExtensionEnabled) return null;
        removeToolbar();

        const toolbar = document.createElement('div');
        toolbar.id = CONFIG.toolbarId;
        toolbar.className = STATE.isDarkMode ? '' : 'light-mode';
        
        toolbar.innerHTML = `
            <div class="button-group">
                <button data-command="undo" class="history-btn" data-tooltip="Undo (Ctrl+Z)" ${STATE.historyIndex < 0 ? 'disabled' : ''}>↶</button>
                <button data-command="redo" class="history-btn" data-tooltip="Redo (Ctrl+Y)" ${STATE.historyIndex >= STATE.history.length - 1 ? 'disabled' : ''}>↷</button>
            </div>
            
            <div class="button-group">
                <button data-command="bold" data-tooltip="Bold (Ctrl+Shift+B)">Bold</button>
                <button data-command="highlight" data-tooltip="Highlight">Highlight</button>
            </div>
            
            <div class="button-group">
                <button data-command="sizeDown" class="size-btn" data-tooltip="Decrease Size (Ctrl+Shift+-)">A-</button>
                <button data-command="sizeUp" class="size-btn" data-tooltip="Increase Size (Ctrl+Shift++)">A+</button>
            </div>
            
            <div class="button-group">
                <button data-command="fontStyle" class="icon-btn" data-tooltip="Toggle Font Style">A</button>
                <button data-command="spacing" class="icon-btn" data-tooltip="Text Spacing">↔️</button>
                <button data-command="contrast" class="icon-btn" data-tooltip="Fix Contrast">🎨</button>
                <button data-command="readAloud" class="icon-btn" data-tooltip="Read Aloud">🔊</button>
            </div>
            
            <div class="button-group">
                <button data-command="settings" class="settings-btn" data-tooltip="Settings">⚙️</button>
                <button data-command="toggleTheme" class="settings-btn" data-tooltip="Toggle Theme">${STATE.isDarkMode ? '☀️' : '🌙'}</button>
            </div>
        `;

        // Add event listeners to all buttons
        toolbar.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const command = e.target.getAttribute('data-command');
                handleCommand(command);
            });
        });

        document.body.appendChild(toolbar);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toolbar.classList.add('show');
        });
        
        return toolbar;
    }

    /**
     * Positions the toolbar at the top of the viewport
     * @param {HTMLElement} toolbar - The toolbar element
     * @param {Range} range - The selection range
     */
    function positionToolbar(toolbar, range) {
        if (!range) return;

        const rect = range.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        
        const top = 15;
        let left = rect.left + (rect.width / 2);
        
        const toolbarWidth = 380;
        left = Math.max(toolbarWidth / 2 + 15, Math.min(left, viewportWidth - toolbarWidth / 2 - 15));
        
        toolbar.style.top = top + 'px';
        toolbar.style.left = left + 'px';
    }

    /**
     * Removes the toolbar from the document
     */
    function removeToolbar() {
        const existingToolbar = document.getElementById(CONFIG.toolbarId);
        if (existingToolbar) {
            existingToolbar.remove();
        }
    }

    /**
     * Checks if a click is outside the toolbar
     * @param {Event} event - The mouse event
     * @returns {boolean} True if outside toolbar
     */
    function isClickOutsideToolbar(event) {
        const toolbar = document.getElementById(CONFIG.toolbarId);
        const panel = document.getElementById(CONFIG.settingsPanelId);
        return !(toolbar && toolbar.contains(event.target)) && 
               !(panel && panel.contains(event.target));
    }

    // ==================== COMMAND HANDLING ====================

    /**
     * Handle toolbar command execution
     * @param {string} command - The command to execute
     */
    function handleCommand(command) {
        // Handle special commands
        if (command === 'settings') {
            showSettingsPanel();
            return;
        }
        
        if (command === 'toggleTheme') {
            toggleToolbarTheme();
            return;
        }
        
        if (command === 'undo') {
            undo();
            return;
        }
        
        if (command === 'redo') {
            redo();
            return;
        }
        
        // Handle enhancement commands
        enhanceSelection(command);
    }

    /**
     * Apply enhancement to selected text
     * @param {string} command - The enhancement command
     */
    function enhanceSelection(command) {
        if (!STATE.currentSelection || STATE.currentSelection.rangeCount === 0) return;
        if (!STATE.isExtensionEnabled) return;

        const range = STATE.currentSelection.getRangeAt(0);
        let elementToStyle = range.commonAncestorContainer;

        while (elementToStyle && elementToStyle.nodeType !== 1) {
            elementToStyle = elementToStyle.parentElement;
        }

        if (!elementToStyle) return;

        // Save state for undo
        saveState(elementToStyle, command);

        // Execute enhancement
        switch (command) {
            case 'bold':
                toggleBold(elementToStyle);
                break;
            case 'highlight':
                toggleHighlight(elementToStyle);
                break;
            case 'sizeDown':
                adjustFontSize(elementToStyle, -2);
                break;
            case 'sizeUp':
                adjustFontSize(elementToStyle, 2);
                break;
            case 'fontStyle':
                toggleFontStyle(elementToStyle);
                break;
            case 'spacing':
                adjustTextSpacing(elementToStyle);
                break;
            case 'contrast':
                fixTextContrast(elementToStyle);
                break;
            case 'readAloud':
                readTextAloud(elementToStyle);
                break;
        }

        // Increment stats
        chrome.runtime.sendMessage({ action: "incrementStats" });

        updateToolbarState();
    }

    // ==================== ENHANCEMENT FUNCTIONS ====================

    /**
     * Toggle bold styling
     * @param {HTMLElement} el - Element to modify
     */
    function toggleBold(el) {
        const currentWeight = getComputedStyle(el).fontWeight;
        const newWeight = (currentWeight === 'bold' || parseInt(currentWeight) >= 700) ? 'normal' : 'bold';
        el.style.setProperty('font-weight', newWeight, 'important');
        showToast(`Text ${newWeight === 'bold' ? 'bolded' : 'unbolded'}`);
    }

    /**
     * Toggle highlight background
     * @param {HTMLElement} el - Element to modify
     */
    function toggleHighlight(el) {
        const currentBg = getComputedStyle(el).backgroundColor;
        if (currentBg === 'rgba(0, 0, 0, 0)' || currentBg === 'transparent' || currentBg === 'rgb(255, 255, 0)') {
            const newBg = currentBg === 'rgb(255, 255, 0)' ? 'transparent' : 'rgb(255, 255, 0)';
            el.style.setProperty('background-color', newBg, 'important');
            showToast(newBg === 'transparent' ? 'Highlight removed' : 'Text highlighted');
        } else {
            el.style.setProperty('outline', '2px solid yellow', 'important');
            showToast('Outline applied');
        }
    }

    /**
     * Adjust font size
     * @param {HTMLElement} el - Element to modify
     * @param {number} change - Size change amount
     */
    function adjustFontSize(el, change) {
        const currentSize = parseFloat(getComputedStyle(el).fontSize);
        const newSize = currentSize + change;
        
        if (newSize >= CONFIG.fontSizeMin && newSize <= CONFIG.fontSizeMax) {
            el.style.setProperty('font-size', newSize + 'px', 'important');
            showToast(`Font size: ${newSize}px`);
        } else {
            showToast(`Size limit reached (${CONFIG.fontSizeMin}-${CONFIG.fontSizeMax}px)`);
        }
    }

    /**
     * Toggle font family
     * @param {HTMLElement} el - Element to modify
     */
    function toggleFontStyle(el) {
        if (STATE.currentFontStyle === 'sans-serif') {
            el.style.setProperty('font-family', 'Georgia, serif', 'important');
            STATE.currentFontStyle = 'serif';
            showToast('Font: Serif');
        } else {
            el.style.setProperty('font-family', 'Arial, sans-serif', 'important');
            STATE.currentFontStyle = 'sans-serif';
            showToast('Font: Sans-serif');
        }
    }

    /**
     * Adjust text spacing
     * @param {HTMLElement} el - Element to modify
     */
    function adjustTextSpacing(el) {
        const currentLetterSpacing = getComputedStyle(el).letterSpacing;
        
        if (currentLetterSpacing === 'normal' || parseFloat(currentLetterSpacing) < 2) {
            el.style.setProperty('letter-spacing', '2px', 'important');
            el.style.setProperty('word-spacing', '4px', 'important');
            showToast('Spacing increased');
        } else {
            el.style.setProperty('letter-spacing', 'normal', 'important');
            el.style.setProperty('word-spacing', 'normal', 'important');
            showToast('Spacing reset');
        }
    }

    /**
     * Fix text contrast
     * @param {HTMLElement} el - Element to modify
     */
    function fixTextContrast(el) {
        const textColor = getComputedStyle(el).color;
        const bgColor = getComputedStyle(el).backgroundColor;
        const rgbMatch = textColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            const newColor = brightness > 128 ? '#000000' : '#ffffff';
            el.style.setProperty('color', newColor, 'important');
            showToast(`Contrast fixed: ${newColor === '#000000' ? 'Black' : 'White'} text`);
        }
    }

    /**
     * Read text aloud using speech synthesis
     * @param {HTMLElement} el - Element to read
     */
    function readTextAloud(el) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Stop any ongoing speech
            const speech = new SpeechSynthesisUtterance(el.textContent);
            speech.rate = 0.9;
            speech.pitch = 1;
            window.speechSynthesis.speak(speech);
            showToast('Reading text...');
        } else {
            showToast('Speech synthesis not supported');
        }
    }

    // ==================== HISTORY MANAGEMENT ====================

    /**
     * Save current state to history for undo/redo
     * @param {HTMLElement} element - The modified element
     * @param {string} command - The command executed
     */
    function saveState(element, command) {
        const state = {
            element: element,
            command: command,
            styles: {
                fontWeight: element.style.fontWeight,
                backgroundColor: element.style.backgroundColor,
                fontSize: element.style.fontSize,
                fontFamily: element.style.fontFamily,
                letterSpacing: element.style.letterSpacing,
                wordSpacing: element.style.wordSpacing,
                color: element.style.color,
                outline: element.style.outline
            },
            timestamp: Date.now()
        };

        // Remove any states after current index (for redo)
        STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
        
        // Add new state
        STATE.history.push(state);
        STATE.historyIndex++;

        // Limit history size
        if (STATE.history.length > CONFIG.maxHistorySize) {
            STATE.history.shift();
            STATE.historyIndex--;
        }
    }

    /**
     * Undo last action
     */
    function undo() {
        if (STATE.historyIndex < 0) {
            showToast('Nothing to undo');
            return;
        }

        const state = STATE.history[STATE.historyIndex];
        applyState(state);
        STATE.historyIndex--;
        updateToolbarState();
        showToast('Undone');
    }

    /**
     * Redo last undone action
     */
    function redo() {
        if (STATE.historyIndex >= STATE.history.length - 1) {
            showToast('Nothing to redo');
            return;
        }

        STATE.historyIndex++;
        const state = STATE.history[STATE.historyIndex];
        applyState(state);
        updateToolbarState();
        showToast('Redone');
    }

    /**
     * Apply a saved state to an element
     * @param {Object} state - The state to apply
     */
    function applyState(state) {
        if (!state.element) return;
        
        Object.entries(state.styles).forEach(([prop, value]) => {
            if (value) {
                state.element.style.setProperty(
                    prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
                    value,
                    'important'
                );
            }
        });
    }

    /**
     * Update toolbar button states
     */
    function updateToolbarState() {
        const toolbar = document.getElementById(CONFIG.toolbarId);
        if (!toolbar) return;

        const undoBtn = toolbar.querySelector('[data-command="undo"]');
        const redoBtn = toolbar.querySelector('[data-command="redo"]');

        if (undoBtn) {
            undoBtn.disabled = STATE.historyIndex < 0;
        }
        if (redoBtn) {
            redoBtn.disabled = STATE.historyIndex >= STATE.history.length - 1;
        }
    }

    // ==================== SETTINGS PANEL ====================

    /**
     * Show settings panel
     */
    function showSettingsPanel() {
        // Remove existing panel
        removeSettingsPanel();

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = CONFIG.settingsOverlayId;
        overlay.addEventListener('click', removeSettingsPanel);
        document.body.appendChild(overlay);

        // Create panel
        const panel = document.createElement('div');
        panel.id = CONFIG.settingsPanelId;
        panel.className = STATE.isDarkMode ? '' : 'light-mode';
        
        panel.innerHTML = `
            <h3>Accessibility Settings</h3>
            
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="auto-save-settings" ${STATE.siteSettings[STATE.currentDomain]?.autoSave ? 'checked' : ''}>
                    Auto-save settings for this website
                </label>
            </div>
            
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="show-tooltips" checked>
                    Show button tooltips
                </label>
            </div>
            
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="enable-shortcuts" checked>
                    Enable keyboard shortcuts
                </label>
            </div>
            
            <div class="setting-item">
                <button id="export-settings" style="width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Export Settings
                </button>
            </div>
            
            <div class="setting-item">
                <button id="import-settings" style="width: 100%; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Import Settings
                </button>
            </div>
            
            <button class="close-btn">Close</button>
        `;

        document.body.appendChild(panel);

        // Add event listeners
        panel.querySelector('.close-btn').addEventListener('click', removeSettingsPanel);
        panel.querySelector('#auto-save-settings').addEventListener('change', (e) => {
            saveSiteSettings({ autoSave: e.target.checked });
        });
        panel.querySelector('#export-settings').addEventListener('click', exportSettings);
        panel.querySelector('#import-settings').addEventListener('click', importSettings);
    }

    /**
     * Remove settings panel
     */
    function removeSettingsPanel() {
        const panel = document.getElementById(CONFIG.settingsPanelId);
        const overlay = document.getElementById(CONFIG.settingsOverlayId);
        if (panel) panel.remove();
        if (overlay) overlay.remove();
    }

    /**
     * Export settings to JSON file
     */
    function exportSettings() {
        const settings = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            siteSettings: STATE.siteSettings,
            preferences: {
                darkMode: STATE.isDarkMode
            }
        };

        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accessibility-settings-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Settings exported');
    }

    /**
     * Import settings from JSON file
     */
    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const settings = JSON.parse(event.target.result);
                    STATE.siteSettings = settings.siteSettings || {};
                    STATE.isDarkMode = settings.preferences?.darkMode ?? true;
                    
                    chrome.storage.local.set({
                        siteSettings: STATE.siteSettings,
                        darkMode: STATE.isDarkMode
                    });
                    
                    showToast('Settings imported successfully');
                    removeSettingsPanel();
                } catch (error) {
                    showToast('Error importing settings');
                    console.error('Import error:', error);
                }
            };
            reader.readAsText(file);
        });
        
        input.click();
    }

    /**
     * Toggle toolbar theme
     */
    function toggleToolbarTheme() {
        STATE.isDarkMode = !STATE.isDarkMode;
        chrome.storage.local.set({ darkMode: STATE.isDarkMode });
        
        const toolbar = document.getElementById(CONFIG.toolbarId);
        if (toolbar) {
            toolbar.className = STATE.isDarkMode ? '' : 'light-mode';
            
            // Update theme button
            const themeBtn = toolbar.querySelector('[data-command="toggleTheme"]');
            if (themeBtn) {
                themeBtn.textContent = STATE.isDarkMode ? '☀️' : '🌙';
            }
        }
        
        showToast(`${STATE.isDarkMode ? 'Dark' : 'Light'} mode activated`);
    }

    // ==================== UI HELPERS ====================

    /**
     * Show a temporary notification toast
     * @param {string} message - Message to display
     */
    function showToast(message) {
        // Remove existing toasts
        document.querySelectorAll('.accessibility-toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = 'accessibility-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.toastDuration);
    }

    // ==================== EVENT LISTENERS ====================

    /**
     * Setup all event listeners
     */
    function setupEventListeners() {
        // Selection change handler
        document.addEventListener('selectionchange', handleSelectionChange);

        // Click outside toolbar
        document.addEventListener('mousedown', (e) => {
            if (isClickOutsideToolbar(e)) {
                removeToolbar();
            }
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                removeToolbar();
                removeSettingsPanel();
            }
        });

        // Window scroll
        window.addEventListener('scroll', () => {
            const toolbar = document.getElementById(CONFIG.toolbarId);
            if (toolbar && STATE.currentSelection && STATE.currentSelection.rangeCount > 0) {
                const range = STATE.currentSelection.getRangeAt(0);
                positionToolbar(toolbar, range);
            }
        });

        // Window resize
        window.addEventListener('resize', () => {
            const toolbar = document.getElementById(CONFIG.toolbarId);
            if (toolbar && STATE.currentSelection && STATE.currentSelection.rangeCount > 0) {
                const range = STATE.currentSelection.getRangeAt(0);
                positionToolbar(toolbar, range);
            }
        });
    }

    /**
     * Handle selection changes
     */
    function handleSelectionChange() {
        if (!STATE.isExtensionEnabled) return;

        STATE.currentSelection = window.getSelection();
        
        if (STATE.toolbarTimeout) {
            clearTimeout(STATE.toolbarTimeout);
        }
        
        if (!STATE.currentSelection || STATE.currentSelection.toString().trim().length === 0) {
            removeToolbar();
            return;
        }

        if (STATE.currentSelection.toString().trim().length > 0 && STATE.currentSelection.rangeCount > 0) {
            const range = STATE.currentSelection.getRangeAt(0);
            
            if (range && range.toString().trim().length > 0) {
                STATE.toolbarTimeout = setTimeout(() => {
                    if (STATE.currentSelection && STATE.currentSelection.toString().trim().length > 0) {
                        const toolbar = createToolbar();
                        if (toolbar) {
                            positionToolbar(toolbar, range);
                        }
                    }
                }, CONFIG.selectionDelay);
            }
        }
    }

    /**
     * Setup keyboard shortcuts
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Check if shortcuts are enabled (could be a setting)
            if (!STATE.isExtensionEnabled) return;

            // Ctrl/Cmd + Z = Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                const toolbar = document.getElementById(CONFIG.toolbarId);
                if (toolbar) {
                    e.preventDefault();
                    undo();
                }
            }

            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                const toolbar = document.getElementById(CONFIG.toolbarId);
                if (toolbar) {
                    e.preventDefault();
                    redo();
                }
            }

            // Ctrl/Cmd + Shift + B = Bold
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
                e.preventDefault();
                if (STATE.currentSelection && STATE.currentSelection.toString().trim().length > 0) {
                    enhanceSelection('bold');
                }
            }

            // Ctrl/Cmd + Shift + H = Highlight
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                if (STATE.currentSelection && STATE.currentSelection.toString().trim().length > 0) {
                    enhanceSelection('highlight');
                }
            }
        });
    }

    // ==================== INITIALIZATION ====================

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
// Toolbar rendering, positioning, keyboard navigation, and visual state.

import { CONFIG, SHORTCUT_LABELS, STATE, TOGGLE_COMMANDS } from './core.js';
import { getMountNode } from './dom.js';
import { showToast } from './toast.js';

let runCommand = () => {};
let resolveCommandScope = () => null;
let readToggleStates = () => ({});

/**
 * Supply the command callbacks the toolbar needs. Keeping them injected
 * avoids a circular import between the toolbar and command modules.
 * @param {{runCommand?: Function, getScopeOverride?: Function, getToggleStates?: Function}} handlers
 */
export function configureToolbar(handlers = {}) {
    if (typeof handlers.runCommand === 'function') {
        runCommand = handlers.runCommand;
    }
    if (typeof handlers.getScopeOverride === 'function') {
        resolveCommandScope = handlers.getScopeOverride;
    }
    if (typeof handlers.getToggleStates === 'function') {
        readToggleStates = handlers.getToggleStates;
    }
}

// ==================== TOOLBAR MANAGEMENT ====================

/**
 * Creates and returns the enhanced toolbar element.
 * @returns {HTMLElement|null} The created toolbar element
 */
export function createToolbar() {
    if (!STATE.isExtensionEnabled) {
        return null;
    }
    removeToolbar();

    const toolbar = document.createElement('div');
    toolbar.id = CONFIG.toolbarId;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Accessibility text enhancement');
    toolbar.setAttribute('aria-orientation', 'horizontal');
    if (STATE.focusToolbarAriaShortcut) {
        toolbar.setAttribute('aria-keyshortcuts', STATE.focusToolbarAriaShortcut);
    }

    if (!STATE.isDarkMode) {
        toolbar.classList.add('light-mode');
    }

    toolbar.innerHTML = `
        <div class="button-group">
            <button type="button" data-command="undo" class="history-btn" data-tooltip="Undo (${SHORTCUT_LABELS.undo})" ${STATE.historyIndex < 0 ? 'disabled' : ''}>↶</button>
            <button type="button" data-command="redo" class="history-btn" data-tooltip="Redo (${SHORTCUT_LABELS.redo})" ${STATE.historyIndex >= STATE.history.length - 1 ? 'disabled' : ''}>↷</button>
        </div>

        <div class="button-group">
            <button type="button" data-command="bold" data-tooltip="Bold (${SHORTCUT_LABELS.bold}) · Shift: paragraph">Bold</button>
            <button type="button" data-command="highlight" data-tooltip="Highlight (${SHORTCUT_LABELS.highlight}) · Shift: paragraph">Highlight</button>
        </div>

        <div class="button-group">
            <button type="button" data-command="sizeDown" class="size-btn" data-tooltip="Decrease Size · Shift: selection">A-</button>
            <button type="button" data-command="sizeUp" class="size-btn" data-tooltip="Increase Size · Shift: selection">A+</button>
        </div>

        <div class="button-group">
            <button type="button" data-command="fontStyle" class="icon-btn" data-tooltip="Toggle Font Style · Shift: selection">A</button>
            <button type="button" data-command="spacing" class="icon-btn" data-tooltip="Text Spacing · Shift: selection">↔️</button>
            <button type="button" data-command="contrast" class="icon-btn" data-tooltip="Fix Contrast · Shift: selection">🎨</button>
            <button type="button" data-command="readAloud" class="icon-btn" data-tooltip="Read Aloud (${SHORTCUT_LABELS.read})">🔊</button>
            <button type="button" data-command="stopReading" class="icon-btn" data-tooltip="Stop Reading" tabindex="-1" hidden>⏹️</button>
        </div>

        <div class="button-group">
            <button type="button" data-command="settings" class="settings-btn" data-tooltip="Settings">⚙️</button>
            <button type="button" data-command="toggleTheme" class="settings-btn" data-tooltip="Toggle Theme">${STATE.isDarkMode ? '☀️' : '🌙'}</button>
        </div>
    `;

    // Add accessible names and event listeners to all buttons.
    toolbar.querySelectorAll('button').forEach((btn) => {
        const label = btn.dataset.tooltip;
        if (label) {
            btn.setAttribute('aria-label', label);
        }

        // Prevent the page selection from being cleared when a button is
        // pressed, and stop page-level click handlers from seeing the click.
        btn.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            runCommand(btn.dataset.command, {
                scope: resolveCommandScope(btn.dataset.command, event.shiftKey)
            });
        });
    });

    // Add the animation class before insertion so the toolbar does not
    // flash at full opacity for one frame before sliding in.
    toolbar.classList.add('show');
    getMountNode().appendChild(toolbar);
    applyTheme();
    setupToolbarKeyboardNavigation(toolbar);
    updateToolbarState();

    return toolbar;
}

/**
 * Buttons in a toolbar that can currently receive focus.
 * @param {HTMLElement} toolbar
 * @param {boolean} [includeDisabled]
 * @returns {HTMLButtonElement[]}
 */
export function getToolbarButtons(toolbar, includeDisabled = false) {
    return Array.from(toolbar.querySelectorAll('button'))
        .filter((button) => !button.hidden && (includeDisabled || !button.disabled));
}

/**
 * Make one button the toolbar's single tab stop.
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} toolbar
 */
export function setToolbarTabStop(button, toolbar) {
    // Reset hidden buttons too. Otherwise a hidden reading control can
    // keep a stale tabindex="0" after it leaves the toolbar.
    Array.from(toolbar.querySelectorAll('button')).forEach((item) => {
        item.setAttribute('tabindex', item === button ? '0' : '-1');
    });
}

/**
 * Keep exactly one enabled button in the tab order, and move focus off a
 * button that just became disabled.
 * @param {HTMLElement} toolbar
 */
export function syncToolbarTabStops(toolbar) {
    const enabled = getToolbarButtons(toolbar);

    if (enabled.length === 0) {
        getToolbarButtons(toolbar, true).forEach((button) => {
            button.setAttribute('tabindex', '-1');
        });
        return;
    }

    const active = document.activeElement;
    let target = enabled.find((button) => button.getAttribute('tabindex') === '0');

    // Only keep focus on the current button if it is still usable. A stop
    // button becomes hidden when reading ends, and an undo button can
    // become disabled; neither can own the toolbar's tab stop.
    if (active && enabled.includes(active)) {
        target = active;
    }

    if (!target) {
        target = enabled[0];
    }

    setToolbarTabStop(target, toolbar);

    // A keyboard user can disable undo/redo with the button they are on.
    // A reading control can also become hidden when reading stops.
    if (active && toolbar.contains(active) && (active.disabled || active.hidden)) {
        target.focus({ preventScroll: true });
    }
}

/**
 * Arrow-key navigation for the toolbar's single tab stop.
 * @param {HTMLElement} toolbar
 */
export function setupToolbarKeyboardNavigation(toolbar) {
    toolbar.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            return;
        }

        const buttons = getToolbarButtons(toolbar);
        if (buttons.length === 0) {
            return;
        }

        const currentIndex = buttons.indexOf(document.activeElement);
        let nextIndex;

        if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = buttons.length - 1;
        } else if (currentIndex === -1) {
            nextIndex = 0;
        } else {
            const step = event.key === 'ArrowRight' ? 1 : -1;
            nextIndex = (currentIndex + step + buttons.length) % buttons.length;
        }

        event.preventDefault();
        event.stopPropagation();

        const next = buttons[nextIndex];
        setToolbarTabStop(next, toolbar);
        next.focus({ preventScroll: true });
    });
}

/**
 * Focus the toolbar for the current selection, creating it immediately if
 * the selection delay has not fired yet.
 */
export function focusToolbarForSelection() {
    const isPending = Boolean(STATE.toolbarTimeout);
    if (STATE.toolbarTimeout) {
        clearTimeout(STATE.toolbarTimeout);
        STATE.toolbarTimeout = null;
    }

    const existing = document.getElementById(CONFIG.toolbarId);
    if (existing && !isPending) {
        // Already focused inside the toolbar: keep the current button.
        if (existing.contains(document.activeElement)) {
            return;
        }

        const buttons = getToolbarButtons(existing);
        if (buttons.length > 0) {
            setToolbarTabStop(buttons[0], existing);
            buttons[0].focus({ preventScroll: true });
        }
        return;
    }

    if (!STATE.savedRange) {
        const hint = STATE.focusToolbarShortcut
            ? `press ${STATE.focusToolbarShortcut}`
            : 'use the Focus Toolbar shortcut';
        showToast(`Select text first, then ${hint}`);
        return;
    }

    // createToolbar() replaces any stale toolbar left over from the
    // previous selection.
    const toolbar = createToolbar();
    if (!toolbar) {
        return;
    }

    positionToolbar(toolbar, STATE.savedRange);

    const buttons = getToolbarButtons(toolbar);
    if (buttons.length > 0) {
        setToolbarTabStop(buttons[0], toolbar);
        buttons[0].focus({ preventScroll: true });
    }

    showToast('Toolbar focused — use arrow keys');
}

/**
 * Positions the toolbar at the top of the viewport.
 * @param {HTMLElement} toolbar - The toolbar element
 * @param {Range} range - The selection range
 */
export function positionToolbar(toolbar, range) {
    if (!toolbar || !range) {
        return;
    }

    const rect = range.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const toolbarWidth = Math.min(
        toolbar.offsetWidth || CONFIG.toolbarMaxWidth,
        viewportWidth - 30
    );
    const center = rect.width > 0 ? rect.left + (rect.width / 2) : viewportWidth / 2;
    const left = Math.max(
        toolbarWidth / 2 + 15,
        Math.min(center, viewportWidth - toolbarWidth / 2 - 15)
    );

    toolbar.style.top = '15px';
    toolbar.style.left = `${left}px`;
}

/**
 * Reposition the toolbar on the next animation frame.
 */
export function scheduleToolbarPosition() {
    if (STATE.positionFrame !== null) {
        return;
    }

    STATE.positionFrame = requestAnimationFrame(() => {
        STATE.positionFrame = null;
        const toolbar = document.getElementById(CONFIG.toolbarId);
        if (toolbar && STATE.savedRange) {
            positionToolbar(toolbar, STATE.savedRange);
        }
    });
}

/**
 * Removes the toolbar and cancels any pending placement work.
 */
export function removeToolbar() {
    if (STATE.positionFrame !== null) {
        cancelAnimationFrame(STATE.positionFrame);
        STATE.positionFrame = null;
    }

    if (STATE.toolbarTimeout) {
        clearTimeout(STATE.toolbarTimeout);
        STATE.toolbarTimeout = null;
    }

    const existingToolbar = document.getElementById(CONFIG.toolbarId);
    if (existingToolbar) {
        existingToolbar.remove();
    }
}

/**
 * Checks if a click is outside the toolbar, settings panel, and overlay.
 * @param {Event} event - The mouse event
 * @returns {boolean} True if outside the extension UI
 */
export function isClickOutsideExtensionUi(event) {
    const toolbar = document.getElementById(CONFIG.toolbarId);
    const panel = document.getElementById(CONFIG.settingsPanelId);
    const overlay = document.getElementById(CONFIG.settingsOverlayId);

    return !(toolbar && toolbar.contains(event.target)) &&
           !(panel && panel.contains(event.target)) &&
           !(overlay && overlay.contains(event.target));
}

// ==================== READING STATE ====================

/**
 * Mirror the current reading state into the toolbar: the read button
 * becomes play/pause, and a stop button appears while reading.
 */
export function updateToolbarReadingState() {
    const toolbar = document.getElementById(CONFIG.toolbarId);
    if (!toolbar) {
        return;
    }

    const readButton = toolbar.querySelector('[data-command="readAloud"]');
    const stopButton = toolbar.querySelector('[data-command="stopReading"]');
    const reading = STATE.speech;
    const paused = Boolean(reading && reading.paused);

    if (readButton) {
        const label = reading
            ? (paused ? 'Resume Reading' : 'Pause Reading')
            : `Read Aloud (${SHORTCUT_LABELS.read})`;

        readButton.textContent = reading ? (paused ? '▶️' : '⏸️') : '🔊';
        readButton.dataset.tooltip = label;
        readButton.setAttribute('aria-label', label);
        readButton.setAttribute('aria-pressed', reading ? 'true' : 'false');
    }

    // Hiding a focused button moves focus to the document body before the
    // tab-stop sync can observe it. Remember the lost focus so it can be
    // handed to the toolbar's new tab stop afterwards.
    const stopHadFocus = Boolean(
        stopButton && !stopButton.hidden && document.activeElement === stopButton
    );

    if (stopButton) {
        stopButton.hidden = !reading;
    }

    syncToolbarTabStops(toolbar);

    if (stopHadFocus) {
        const next = getToolbarButtons(toolbar)
            .find((button) => button.getAttribute('tabindex') === '0');
        if (next) {
            next.focus({ preventScroll: true });
        }
    }
}

/**
 * Update toolbar button states, the roving tab stop, and the announced
 * toggle state of every toggle command.
 */
export function updateToolbarState() {
    const toolbar = document.getElementById(CONFIG.toolbarId);
    if (!toolbar) {
        return;
    }

    const undoBtn = toolbar.querySelector('[data-command="undo"]');
    const redoBtn = toolbar.querySelector('[data-command="redo"]');
    const active = document.activeElement;
    const hadToolbarFocus = Boolean(active && toolbar.contains(active));

    if (undoBtn) {
        undoBtn.disabled = STATE.historyIndex < 0;
    }
    if (redoBtn) {
        redoBtn.disabled = STATE.historyIndex >= STATE.history.length - 1;
    }

    const states = readToggleStates();

    TOGGLE_COMMANDS.forEach((command) => {
        const button = toolbar.querySelector(`[data-command="${command}"]`);
        if (!button) {
            return;
        }

        const state = states[command];
        if (state === undefined) {
            button.removeAttribute('aria-pressed');
        } else {
            button.setAttribute('aria-pressed', String(state));
        }
    });

    updateToolbarReadingState();

    // Disabling the focused button can drop focus to the page. Put it back
    // on a usable button so the keyboard user does not lose their place.
    if (hadToolbarFocus && !toolbar.contains(document.activeElement)) {
        const fallback = getToolbarButtons(toolbar)[0];
        if (fallback) {
            fallback.focus({ preventScroll: true });
        }
    }
}

/**
 * Apply the current theme to the toolbar and settings panel.
 */
export function applyTheme() {
    const toolbar = document.getElementById(CONFIG.toolbarId);
    if (toolbar) {
        toolbar.classList.toggle('light-mode', !STATE.isDarkMode);

        const themeBtn = toolbar.querySelector('[data-command="toggleTheme"]');
        if (themeBtn) {
            const label = STATE.isDarkMode
                ? 'Switch to light theme'
                : 'Switch to dark theme';
            themeBtn.textContent = STATE.isDarkMode ? '☀️' : '🌙';
            themeBtn.dataset.tooltip = label;
            themeBtn.setAttribute('aria-label', label);
        }
    }

    const panel = document.getElementById(CONFIG.settingsPanelId);
    if (panel) {
        panel.classList.toggle('light-mode', !STATE.isDarkMode);
    }
}

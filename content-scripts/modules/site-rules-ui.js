// The site-rule list shared by the options page and the in-page settings
// dialog. Both surfaces render the same items and use the same two-step
// confirmation before clearing every rule.

import { CONFIG } from './core.js';

/**
 * Human-readable label for a stored site rule.
 * @param {'on'|'off'} rule
 * @returns {string}
 */
function ruleLabel(rule) {
    return rule === 'on' ? 'Always on' : 'Always off';
}

/**
 * Wire the site-rule list under a root element.
 *
 * @param {Object} options
 * @param {HTMLElement|Document} options.root
 * @param {string} [options.prefix] ID prefix used by the surface's markup.
 * @param {() => Object<string, 'on'|'off'>} options.getRules
 * @param {(rules: Object, message: string) => void} options.save
 * @param {(message: string) => void} [options.announce]
 * @returns {{sync: () => void}}
 */
export function initSiteRulesControls({
    root,
    prefix = '',
    getRules,
    save,
    announce = () => {}
}) {
    const byId = (name) => root.querySelector(`#${prefix}${name}`);
    const list = byId('site-rule-list');
    const empty = byId('site-rule-empty');
    const count = byId('site-rule-count');
    const clearButton = byId('clear-site-rules');

    if (!list || !empty || !count || !clearButton) {
        throw new Error('Site rule controls are incomplete');
    }

    let armed = false;
    let timer = null;

    function disarm() {
        armed = false;
        clearButton.textContent = 'Clear all site rules';
        clearButton.classList.remove('armed');
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    /**
     * Rebuild the list and its count from the current rules.
     */
    function sync() {
        const rules = getRules() || {};
        const origins = Object.keys(rules).sort();
        list.innerHTML = '';

        origins.forEach((origin) => {
            const item = document.createElement('li');
            item.className = 'site-rule-item';

            const name = document.createElement('span');
            name.className = 'site-rule-origin';
            name.textContent = origin;

            const value = document.createElement('span');
            value.className = 'site-rule-value';
            value.textContent = ruleLabel(rules[origin]);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'site-rule-remove';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', `Remove site rule for ${origin}`);
            remove.addEventListener('click', () => {
                const next = { ...getRules() };
                delete next[origin];
                save(next, `Removed the site rule for ${origin}.`);
            });

            item.append(name, value, remove);
            list.appendChild(item);
        });

        list.hidden = origins.length === 0;
        empty.hidden = origins.length > 0;
        clearButton.disabled = origins.length === 0;
        count.textContent =
            `${origins.length} of ${CONFIG.maxSiteRules} site rules used.`;

        disarm();
    }

    clearButton.addEventListener('click', () => {
        const rules = getRules() || {};

        if (Object.keys(rules).length === 0) {
            announce('There are no site rules to clear.');
            return;
        }

        if (!armed) {
            armed = true;
            clearButton.textContent = 'Confirm clear all';
            clearButton.classList.add('armed');
            timer = setTimeout(disarm, 5000);
            announce('Activate Confirm clear all to remove every site rule.');
            return;
        }

        disarm();
        save({}, 'All site rules cleared.');
    });

    sync();

    return { sync };
}

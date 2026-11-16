// Shared preferences and per-site rules.
//
// chrome.storage.sync is the source of truth for the settings that should
// follow the user across Chrome profiles: theme, reading preferences, and the
// site rules. The extension's on/off switch stays in chrome.storage.local
// because it is a per-device convenience rather than a preference.

import { CONFIG } from './core.js';

export const SYNC_KEYS = [
    'darkMode',
    'ttsVoice',
    'ttsRate',
    'ttsPitch',
    'siteRules'
];

/**
 * Promise wrapper around a storage area read that tolerates older Chrome.
 * @param {'local'|'sync'} area
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
function getArea(area, keys) {
    return new Promise((resolve) => {
        chrome.storage[area].get(keys, (result) => {
            if (chrome.runtime.lastError) {
                resolve({});
                return;
            }
            resolve(result || {});
        });
    });
}

/**
 * Promise wrapper around a storage area write.
 * @param {'local'|'sync'} area
 * @param {Object} values
 * @returns {Promise<boolean>} Whether the write succeeded.
 */
function setArea(area, values) {
    return new Promise((resolve) => {
        chrome.storage[area].set(values, () => {
            resolve(!chrome.runtime.lastError);
        });
    });
}

/**
 * Load the synced preferences, copying any value that only exists in
 * storage.local (a pre-1.4.0 install) into storage.sync once.
 * @returns {Promise<Object>}
 */
export async function loadSyncedPreferences() {
    const synced = await getArea('sync', SYNC_KEYS);
    const missing = SYNC_KEYS.filter((key) => synced[key] === undefined);

    if (missing.length > 0) {
        // The old build wrote these keys to storage.local. Migrating lazily
        // here means the first page load after an update keeps the user's
        // settings even before the background worker has run onInstalled.
        const legacy = await getArea('local', missing);
        const updates = {};

        for (const key of missing) {
            if (legacy[key] !== undefined) {
                updates[key] = legacy[key];
            }
        }

        if (Object.keys(updates).length > 0) {
            const saved = await setArea('sync', updates);

            // A failed write leaves the legacy values in storage.local so the
            // next page load can retry instead of losing them.
            if (saved) {
                Object.assign(synced, updates);
            }
        }
    }

    // Drop the pre-1.4.0 copies that sync now supersedes. The background
    // migration does the same, but a page can load before it runs.
    const superseded = SYNC_KEYS.filter((key) => synced[key] !== undefined);
    if (superseded.length > 0) {
        chrome.storage.local.remove(superseded);
    }

    return synced;
}

/**
 * Persist one or more synced preferences.
 * @param {Object} values
 */
export function saveSyncedPreferences(values) {
    chrome.storage.sync.set(values);
}

/**
 * The origin a site rule is keyed on. Site rules apply to real web pages;
 * about:, data:, chrome:, and file: URLs have no meaningful origin.
 * @param {Location} [location]
 * @returns {string|null}
 */
export function siteOrigin(location = window.location) {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
        return null;
    }
    return location.origin;
}

/**
 * The rule stored for an origin, if any.
 * @param {Object|null|undefined} rules
 * @param {string|null} origin
 * @returns {'on'|'off'|undefined}
 */
export function ruleForOrigin(rules, origin) {
    if (!origin || !rules || typeof rules !== 'object') {
        return undefined;
    }
    const rule = rules[origin];
    return rule === 'on' || rule === 'off' ? rule : undefined;
}

/**
 * Combine the global switch with the site rule. A rule set for this origin
 * wins over the global default.
 * @param {boolean} globalEnabled
 * @param {Object|null|undefined} rules
 * @param {string|null} origin
 * @returns {boolean}
 */
export function isEnabledForOrigin(globalEnabled, rules, origin) {
    const rule = ruleForOrigin(rules, origin);
    if (rule === 'on') {
        return true;
    }
    if (rule === 'off') {
        return false;
    }
    return globalEnabled;
}

/**
 * Keep only well-formed rules for http(s) origins and cap the map so a large
 * import cannot push the synced item past its quota.
 * @param {unknown} value
 * @returns {Object<string, 'on'|'off'>}
 */
export function normalizeSiteRules(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const rules = {};
    let count = 0;

    for (const [origin, rule] of Object.entries(value)) {
        if (count >= CONFIG.maxSiteRules) {
            break;
        }
        if (rule !== 'on' && rule !== 'off') {
            continue;
        }
        if (!/^https?:\/\/[^/]+$/.test(origin)) {
            continue;
        }
        rules[origin] = rule;
        count++;
    }

    return rules;
}

// Persistence for the label maker, backed by IndexedDB so it can hold labels +
// presets that embed base64 images (well beyond localStorage's ~5 MB quota).
// Legacy localStorage keys from the pre-IndexedDB app are migrated once.
import { idbAvailable, idbGet, idbSet } from './idb.js';

const KEYS = ['labels', 'presets', 'page', 'divisions', 'margin', 'gap', 'output'];

// --- legacy localStorage (read-only, for one-time migration) ---
const LS_PAGE = 'labelMakerPage';
const LS_PRESETS = 'labelMakerPresets';
const LS_DIVISIONS = 'labelMakerDivisions';

function readLegacy() {
    const out = {};
    try {
        const page = JSON.parse(localStorage.getItem(LS_PAGE));
        if (page && typeof page === 'object') { out.page = page; }
    } catch (e) { /* ignore */ }
    try {
        const presets = JSON.parse(localStorage.getItem(LS_PRESETS));
        if (Array.isArray(presets)) { out.presets = presets; }
    } catch (e) { /* ignore */ }
    try {
        const d = parseInt(localStorage.getItem(LS_DIVISIONS), 10);
        if (!isNaN(d)) { out.divisions = d; }
    } catch (e) { /* ignore */ }
    return out;
}

// Load the whole persisted state. Returns an object with any of the KEYS that
// were stored (missing keys are simply absent, so callers keep their defaults).
export async function loadAll() {
    if (!idbAvailable()) { return readLegacy(); }
    let values;
    try {
        values = await Promise.all(KEYS.map((k) => idbGet(k)));
    } catch (e) {
        return readLegacy();
    }
    const state = {};
    KEYS.forEach((k, i) => { if (values[i] !== undefined) { state[k] = values[i]; } });

    // First run on IndexedDB: seed settings/presets from the old localStorage app
    if (state.presets === undefined && state.page === undefined && state.divisions === undefined) {
        const legacy = readLegacy();
        Object.assign(state, legacy);
        // persist the migrated values so this only happens once
        Object.entries(legacy).forEach(([k, v]) => { idbSet(k, v).catch(() => {}); });
    }
    return state;
}

// Persist the given state fields. Returns { ok, error }; never throws.
export async function persistState(state) {
    if (!idbAvailable()) { return { ok: false, error: 'no-storage' }; }
    try {
        await Promise.all(
            KEYS.filter((k) => k in state).map((k) => idbSet(k, state[k])),
        );
        return { ok: true, error: null };
    } catch (e) {
        return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'quota' : 'write-failed' };
    }
}

export function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) { return crypto.randomUUID(); }
    return 'id' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
}

// localStorage helpers. Keys match the pre-Svelte app so existing users keep
// their saved label size and preset library across the migration.

const SIZE_KEY = 'labelMakerSize';
const PAGE_KEY = 'labelMakerPage';
const PRESETS_KEY = 'labelMakerPresets';

export function loadSize() {
    try {
        const saved = JSON.parse(localStorage.getItem(SIZE_KEY));
        return saved && typeof saved === 'object' ? saved : null;
    } catch (e) { return null; }
}

export function saveSize(size) {
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(size)); }
    catch (e) { /* storage unavailable (private mode etc.) */ }
}

export function loadPage() {
    try {
        const saved = JSON.parse(localStorage.getItem(PAGE_KEY));
        return saved && typeof saved === 'object' ? saved : null;
    } catch (e) { return null; }
}

export function savePage(page) {
    try { localStorage.setItem(PAGE_KEY, JSON.stringify(page)); }
    catch (e) { /* storage unavailable */ }
}

export function loadPresets() {
    try {
        const v = JSON.parse(localStorage.getItem(PRESETS_KEY));
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}

export function savePresets(list) {
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)); }
    catch (e) { /* storage unavailable */ }
}

export function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) { return crypto.randomUUID(); }
    return 'id' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
}

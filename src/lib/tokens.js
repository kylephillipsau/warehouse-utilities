// Template tokens for label fields. A field value may contain {{name:arg}}
// placeholders that resolve to live values — today mostly date/time, e.g.
// "PACKED {{date:DD MMM YYYY}}". Resolution runs on every render and at print
// time (new Date() each call), so "today's date" is always current. The token
// registry is extensible: a future {{seq}} counter slots in without touching the
// parser. Unknown tokens are left literal so authoring mistakes stay visible.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = DAYS.map((d) => d.slice(0, 3));
const pad2 = (n) => String(n).padStart(2, '0');

// Longest-first alternation so MMMM matches before MMM before MM before M, etc.
// [text] is a literal escape (moment-style) — its contents pass through verbatim.
const FMT_RE = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g;

// Format a Date with a moment-style pattern. Single-pass replace, so a resolved
// month name's letters are never re-scanned as tokens.
export function formatDate(date, fmt) {
    const d = date instanceof Date && !isNaN(date) ? date : new Date();
    const h12 = d.getHours() % 12 || 12;
    const map = {
        YYYY: () => d.getFullYear(),
        YY: () => pad2(d.getFullYear() % 100),
        MMMM: () => MONTHS[d.getMonth()],
        MMM: () => MONTHS_SHORT[d.getMonth()],
        MM: () => pad2(d.getMonth() + 1),
        M: () => d.getMonth() + 1,
        DD: () => pad2(d.getDate()),
        D: () => d.getDate(),
        dddd: () => DAYS[d.getDay()],
        ddd: () => DAYS_SHORT[d.getDay()],
        HH: () => pad2(d.getHours()),
        H: () => d.getHours(),
        hh: () => pad2(h12),
        h: () => h12,
        mm: () => pad2(d.getMinutes()),
        m: () => d.getMinutes(),
        ss: () => pad2(d.getSeconds()),
        s: () => d.getSeconds(),
        A: () => (d.getHours() < 12 ? 'AM' : 'PM'),
        a: () => (d.getHours() < 12 ? 'am' : 'pm'),
    };
    return String(fmt).replace(FMT_RE, (m, lit) => (lit != null ? lit : String(map[m]())));
}

const DEFAULTS = { date: 'YYYY-MM-DD', time: 'HH:mm', datetime: 'YYYY-MM-DD HH:mm' };

// The token registry. Each entry gets (arg, now, ctx). Add entries here to
// support new placeholders — the parser below needs no changes.
const TOKENS = {
    date: (arg, now) => formatDate(now, arg || DEFAULTS.date),
    time: (arg, now) => formatDate(now, arg || DEFAULTS.time),
    datetime: (arg, now) => formatDate(now, arg || DEFAULTS.datetime),
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][\w]*)\s*(?::\s*([^}]*?))?\s*\}\}/g;

// Resolve every {{...}} in a string. Non-token text passes through untouched;
// unknown token names are left literal (so "{{SKU}}" stays visible until a
// resolver exists). ctx.now is injectable for deterministic tests.
export function resolveTemplate(str, ctx = {}) {
    if (typeof str !== 'string' || str.indexOf('{{') === -1) { return str || ''; }
    const now = ctx.now instanceof Date ? ctx.now : new Date();
    return str.replace(PLACEHOLDER_RE, (m, name, arg) => {
        const fn = TOKENS[name.toLowerCase()];
        if (!fn) { return m; }
        try { return String(fn(arg, now, ctx)); } catch (e) { return m; }
    });
}

// True if the string contains at least one {{...}} placeholder.
export function hasTokens(str) {
    return typeof str === 'string' && /\{\{\s*[a-zA-Z]/.test(str);
}

// Ready-made tokens for the picker in the fields editor.
export const TOKEN_PRESETS = [
    { label: 'Date — 2026-07-22', token: '{{date:YYYY-MM-DD}}' },
    { label: 'Date — 22 Jul 2026', token: '{{date:DD MMM YYYY}}' },
    { label: 'Weekday — Wednesday', token: '{{date:dddd}}' },
    { label: 'Time — 14:05', token: '{{time:HH:mm}}' },
    { label: 'Time — 2:05 pm', token: '{{time:h:mm a}}' },
    { label: 'Date & time', token: '{{datetime}}' },
];

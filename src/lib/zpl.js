// Generate native ZPL so labels print at EXACT physical size on a Zebra printer,
// bypassing Chrome's print pipeline (which rasterizes at ~300 dpi and prints
// ~300/203 ≈ 1.48× too big on a 203-dpi head). Each media page is rendered to a
// 1-bit bitmap at the printer's dot grid and wrapped in a ^GFA graphic field;
// ^PW/^LL lock the physical extents so the output is exact by construction.
import { resolvePage, tiling, clampSpacing, clampDivisions } from './size.js';
import { normalizeAdjust } from './adjust.js';
import { fieldWeight, labelIsEmpty } from './fields.js';
import { resolveTemplate } from './tokens.js';
import { encodeBarcode, drawBarcodeToCanvas } from './barcode.js';

const FONT = '"Glacial Indifference", sans-serif';
const MM_PER_IN = 25.4;

export const ZPL_DPIS = [
    { value: 203, label: '203 dpi (ZD420 / most desktop)' },
    { value: 300, label: '300 dpi' },
];

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// Wrap text into lines that fit maxW at the current ctx.font
function wrapLines(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) { return ['']; }
    const lines = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (!cur || ctx.measureText(test).width <= maxW) { cur = test; }
        else { lines.push(cur); cur = w; }
    }
    if (cur) { lines.push(cur); }
    return lines;
}

// Largest font (binary search) whose wrapped lines fit the box
function fitText(ctx, text, maxW, maxH, bold = true) {
    let lo = 4, hi = Math.max(6, Math.floor(maxH)), best = 4, bestLines = [String(text)];
    const lhFactor = 1.15;
    const weight = bold ? 'bold ' : '';
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        ctx.font = `${weight}${mid}px ${FONT}`;
        const lines = wrapLines(ctx, text, maxW);
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const totalH = lines.length * mid * lhFactor;
        if (widest <= maxW && totalH <= maxH) { best = mid; bestLines = lines; lo = mid + 1; }
        else { hi = mid - 1; }
    }
    return { fontSize: best, lines: bestLines, lineH: best * lhFactor };
}

function drawText(ctx, text, x, y, w, h, align = 'center', bold = true) {
    const pad = Math.max(2, Math.round(w * 0.03));
    const { fontSize, lines, lineH } = fitText(ctx, text, w - 2 * pad, h - 2 * pad, bold);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT}`;
    let tx;
    if (align === 'left') { ctx.textAlign = 'left'; tx = x + pad; }
    else if (align === 'right') { ctx.textAlign = 'right'; tx = x + w - pad; }
    else { ctx.textAlign = 'center'; tx = x + w / 2; }
    const totalH = lines.length * lineH;
    let cy = y + h / 2 - totalH / 2 + lineH / 2;
    for (const line of lines) { ctx.fillText(line, tx, cy); cy += lineH; }
}

// Draw a stack of template fields into (x,y,w,h): each band's height is its
// relative weight, tokens resolved, drawn per the field's align/bold. Mirrors
// the on-screen flex stack so screen and print divide the label identically.
function drawFields(ctx, fields, x, y, w, h) {
    const weights = fields.map(fieldWeight);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const gapD = Math.round(h * 0.02);
    const avail = h - gapD * (fields.length - 1);
    let cy = y;
    fields.forEach((f, i) => {
        const bh = Math.round(avail * weights[i] / total);
        const resolved = resolveTemplate(f.value);
        if (f.type === 'barcode') {
            drawBarcodeField(ctx, f, resolved, x, cy, w, bh);
        } else if (resolved && resolved.trim()) {
            drawText(ctx, resolved, x, cy, w, bh, f.align, f.bold);
        }
        cy += bh + gapD;
    });
}

// Draw a barcode field into its band: bars/modules via drawBarcodeToCanvas at
// integer dots, and the human-readable value under a 1D symbol when enabled.
function drawBarcodeField(ctx, field, value, x, y, w, h) {
    const enc = encodeBarcode(value, field.symbology);
    if (!enc || enc.error) { return; }
    const showHri = enc.kind === '1d' && field.hri !== false;
    const hriH = showHri ? Math.max(12, Math.round(h * 0.22)) : 0;
    const drawn = drawBarcodeToCanvas(ctx, enc, x, y, w, h - hriH, { align: field.align });
    if (drawn.ok && hriH) { drawText(ctx, enc.text, x, y + h - hriH, w, hriH, 'center', false); }
}

// Replicate CSS object-fit + object-position + transform:scale for an image
function drawImage(ctx, img, x, y, w, h, adjust) {
    const a = normalizeAdjust(adjust);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) { return; }
    let scale = a.fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    scale *= (a.zoom || 1);
    const dw = iw * scale, dh = ih * scale;
    const dx = x + (w - dw) * ((a.posX ?? 50) / 100);
    const dy = y + (h - dh) * ((a.posY ?? 50) / 100);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
}

// Draw one label segment into (x,y,w,h), optionally with a cut-guide border
function drawLabel(ctx, label, x, y, w, h, img, showBorder = true) {
    const border = Math.max(2, Math.round(Math.min(w, h) * 0.01));
    const hasFields = label.fields && label.fields.length && !label.image;
    const hasImage = !!label.image && img;
    const hasText = label.text && label.text.trim().length > 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    if (hasFields) {
        drawFields(ctx, label.fields, x, y, w, h);
    } else if (hasImage) {
        drawImage(ctx, img, x, y, w, h, label.adjust);
        if (hasText) {
            const bandH = Math.round(h * 0.3);
            ctx.fillStyle = '#fff';
            ctx.fillRect(x, y + h - bandH, w, bandH);
            drawText(ctx, label.text, x, y + h - bandH, w, bandH);
        }
    } else if (hasText) {
        drawText(ctx, label.text, x, y, w, h);
    }
    if (showBorder) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = border;
        ctx.strokeRect(x + border / 2, y + border / 2, w - border, h - border);
    }
}

// Pack a canvas to a 1-bit ^GFA payload (MSB = leftmost pixel, 1 = black dot)
function canvasToGFA(canvas) {
    const W = canvas.width, H = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    const bytesPerRow = Math.ceil(W / 8);
    const total = bytesPerRow * H;
    let hex = '';
    for (let row = 0; row < H; row++) {
        for (let bcol = 0; bcol < bytesPerRow; bcol++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const xp = bcol * 8 + bit;
                let black = 0;
                if (xp < W) {
                    const i = (row * W + xp) * 4;
                    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    black = (data[i + 3] > 128 && lum < 128) ? 1 : 0;
                }
                byte = (byte << 1) | black;
            }
            hex += byte.toString(16).padStart(2, '0');
        }
    }
    return { hex: hex.toUpperCase(), bytesPerRow, total };
}

// Build a ZPL document: one ^XA…^XZ media page per group of `perPage` labels,
// each rendered at the printer's dot grid. Returns { zpl, pages, skipped }.
export async function buildZpl(store, dpi = 203) {
    // Zebra "203 dpi" is really 203.2 = exactly 8 dots/mm; 300 dpi = 300/25.4.
    const dpmm = dpi === 203 ? 8 : dpi / MM_PER_IN;
    const media = resolvePage(store.page);                 // native physical stock
    const landscape = store.orientation === 'landscape';
    const showBorder = store.showBorders !== false;
    const n = clampDivisions(store.divisions);
    const per = tiling(store.divisions).perPage;
    const m = clampSpacing(store.margin);
    const g = clampSpacing(store.gap);

    // The bitmap is always the native media (so ^PW/^LL match the loaded stock);
    // in landscape the design layout is rotated 90° onto it, so it prints exact.
    const pageW = Math.round(media.width * dpmm);
    const pageH = Math.round(media.height * dpmm);
    const designW = landscape ? pageH : pageW;             // layout coords
    const designH = landscape ? pageW : pageH;
    const marginD = Math.round(m * dpmm);
    const gapD = Math.round(g * dpmm);
    const labelW = designW - 2 * marginD;
    const labelH = Math.round((designH - 2 * marginD - (n - 1) * gapD) / n);

    // only print non-empty labels (classic text/image OR template fields)
    const labels = store.labels.filter((l) => !labelIsEmpty(l));
    const skipped = store.labels.length - labels.length;

    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        try { await document.fonts.load(`bold 40px ${FONT}`); await document.fonts.ready; } catch (e) { /* ignore */ }
    }

    // preload images once
    const imgCache = new Map();
    for (const l of labels) {
        if (l.image && !imgCache.has(l.image)) { imgCache.set(l.image, await loadImage(l.image)); }
    }

    let zpl = '';
    let pages = 0;
    for (let i = 0; i < labels.length; i += per) {
        const group = labels.slice(i, i + per);
        const canvas = document.createElement('canvas');
        canvas.width = pageW;
        canvas.height = pageH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, pageW, pageH);
        // Landscape: rotate the drawing frame 90° CW so the design (designW ×
        // designH) maps exactly onto the native media canvas (pageW × pageH).
        ctx.save();
        if (landscape) { ctx.translate(pageW, 0); ctx.rotate(Math.PI / 2); }
        group.forEach((l, idx) => {
            const x = marginD;
            const y = marginD + idx * (labelH + gapD);
            drawLabel(ctx, l, x, y, labelW, labelH, imgCache.get(l.image), showBorder);
        });
        ctx.restore();
        const { hex, bytesPerRow, total } = canvasToGFA(canvas);
        zpl += `^XA\n^PW${pageW}\n^LL${pageH}\n^LH0,0\n^FO0,0^GFA,${total},${total},${bytesPerRow},${hex}^FS\n^XZ\n`;
        pages++;
    }
    return { zpl, pages, skipped };
}

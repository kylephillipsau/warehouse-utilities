<script>
    // Renders a barcode as inline SVG for the on-screen preview. Vector, so it's
    // crisp at any band size and prints fine via the browser too; the ZPL path
    // uses drawBarcodeToCanvas from the same encoder. Draws in "module units" via
    // a viewBox and lets preserveAspectRatio fit + align it in the band.
    import { encodeBarcode, QUIET_1D, QUIET_QR } from '../lib/barcode.js';

    let { value = '', symbology = 'code128', hri = true, align = 'center' } = $props();

    const enc = $derived(encodeBarcode(value, symbology));

    // 1D geometry in module units.
    const oneD = $derived.by(() => {
        if (!enc || enc.kind !== '1d') { return null; }
        const N = enc.modules.length;
        const barH = 30;                 // tall bars (units)
        const hriH = hri ? 9 : 0;
        const w = N + 2 * QUIET_1D;
        const bars = [];
        for (let i = 0; i < N; i++) { if (enc.modules[i] === '1') { bars.push(QUIET_1D + i); } }
        return { N, barH, hriH, w, h: barH + hriH, bars, text: enc.text };
    });

    // QR geometry in module units.
    const qr = $derived.by(() => {
        if (!enc || enc.kind !== '2d') { return null; }
        const n = enc.size;
        const cells = [];
        for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) { if (enc.isDark(r, c)) { cells.push([QUIET_QR + c, QUIET_QR + r]); } } }
        return { n, w: n + 2 * QUIET_QR, cells };
    });

    // preserveAspectRatio alignment from the field's align (default center).
    const parAlign = $derived(`${align === 'left' ? 'xMin' : align === 'right' ? 'xMax' : 'xMid'}YMid meet`);
</script>

{#if enc && enc.error}
    <span class="barcode-invalid" aria-label="Invalid barcode data">⚠ invalid</span>
{:else if oneD}
    <svg class="barcode-svg" viewBox="0 0 {oneD.w} {oneD.h}" preserveAspectRatio={parAlign} role="img" aria-label={`Barcode ${oneD.text}`}>
        {#each oneD.bars as bx}
            <rect x={bx} y="0" width="1" height={oneD.barH} fill="#000" shape-rendering="crispEdges" />
        {/each}
        {#if oneD.hriH}
            <text x={oneD.w / 2} y={oneD.barH + oneD.hriH - 1.5} font-size="7" text-anchor="middle" fill="#000" font-family="monospace">{oneD.text}</text>
        {/if}
    </svg>
{:else if qr}
    <svg class="barcode-svg" viewBox="0 0 {qr.w} {qr.w}" preserveAspectRatio={parAlign} role="img" aria-label="QR code">
        {#each qr.cells as [cx, cy]}
            <rect x={cx} y={cy} width="1" height="1" fill="#000" shape-rendering="crispEdges" />
        {/each}
    </svg>
{/if}

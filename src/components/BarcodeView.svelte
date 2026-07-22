<script>
    // On-screen barcode preview as inline SVG (vector → crisp at any size; prints
    // fine via the browser too). A 1D barcode fills the band WIDTH by default
    // (bars stretch to the band height); `scale` narrows it. QR stays square. The
    // ZPL path uses native ^BC/^BQ from the same encoder. The field's own band
    // handles left/center/right via justify-content, so we just size the box.
    import { encodeBarcode, QUIET_1D, QUIET_QR } from '../lib/barcode.js';

    let { value = '', symbology = 'code128', hri = true, scale = 1, ecLevel = 'M' } = $props();

    const enc = $derived(encodeBarcode(value, symbology, { ecLevel }));
    const boxWidth = $derived(`${Math.min(100, Math.max(10, scale * 100))}%`);

    // 1D bars (module units); HRI is a separate row so it isn't distorted.
    const oneD = $derived.by(() => {
        if (!enc || enc.kind !== '1d') { return null; }
        const N = enc.modules.length;
        const bars = [];
        for (let i = 0; i < N; i++) { if (enc.modules[i] === '1') { bars.push(QUIET_1D + i); } }
        return { w: N + 2 * QUIET_1D, bars, text: enc.text };
    });
    const qr = $derived.by(() => {
        if (!enc || enc.kind !== '2d') { return null; }
        const n = enc.size;
        const cells = [];
        for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) { if (enc.isDark(r, c)) { cells.push([QUIET_QR + c, QUIET_QR + r]); } } }
        return { w: n + 2 * QUIET_QR, cells };
    });
</script>

{#if enc && enc.error}
    <span class="barcode-invalid" aria-label="Invalid barcode data">⚠ invalid</span>
{:else if oneD}
    <div class="barcode-box" style="width:{boxWidth}">
        <svg class="barcode-bars" viewBox="0 0 {oneD.w} 30" preserveAspectRatio="none" role="img" aria-label={`Barcode ${oneD.text}`}>
            {#each oneD.bars as bx}
                <rect x={bx} y="0" width="1" height="30" fill="#000" shape-rendering="crispEdges" />
            {/each}
        </svg>
        {#if hri}
            <div class="barcode-hri">{oneD.text}</div>
        {/if}
    </div>
{:else if qr}
    <div class="barcode-box qr" style="width:{boxWidth}">
        <svg class="barcode-qr" viewBox="0 0 {qr.w} {qr.w}" preserveAspectRatio="xMidYMid meet" role="img" aria-label={symbology === 'datamatrix' ? 'Data Matrix barcode' : 'QR code'}>
            {#each qr.cells as [cx, cy]}
                <rect x={cx} y={cy} width="1" height="1" fill="#000" shape-rendering="crispEdges" />
            {/each}
        </svg>
    </div>
{/if}

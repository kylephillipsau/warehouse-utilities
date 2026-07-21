<script>
    // A side panel that lives IN the layout (not an overlay): the outer column
    // animates its width 0 <-> panel width, so opening it pushes the label
    // workspace instead of covering it. It sits inside the workspace row, below
    // the header, on the left or the right. Hidden entirely in print (.drawer-col).
    //
    // Two modes:
    //  - toggled (default): opens/closes via `open`; when closed it's inert/
    //    aria-hidden, moves focus in on open and restores it on close, Esc closes.
    //    Used for the left Presets/Import drawers and the mobile inspector sheet.
    //  - persistent: a docked column that's always open and never traps focus or
    //    closes on Escape. Used for the desktop inspector.
    let {
        open = false,
        title = '',
        side = 'left',
        persistent = false,
        widthClass = 'w-[min(22rem,calc(100vw-2.5rem))]',
        id = undefined,
        onClose,
        children,
    } = $props();

    const shown = $derived(persistent || open);

    let panelEl;
    // Toggled mode only: move focus into the panel when it opens and restore it
    // to whatever opened it when it closes. A persistent docked column must not
    // steal focus or trap it, so this is skipped entirely when persistent.
    $effect(() => {
        if (persistent || !open) { return; }
        const opener = document.activeElement;
        const raf = requestAnimationFrame(() => {
            // Don't steal focus if a control inside already claimed it (e.g. the
            // just-saved preset's rename field auto-focusing).
            if (panelEl && !panelEl.contains(document.activeElement)) { panelEl.focus(); }
        });
        const onKey = (e) => { if (e.key === 'Escape') { onClose?.(); } };
        document.addEventListener('keydown', onKey);
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('keydown', onKey);
            if (opener && typeof opener.focus === 'function') { opener.focus(); }
        };
    });
</script>

<div
    class="drawer-col shrink-0 overflow-hidden transition-[width] duration-200 ease-out
           {shown ? widthClass : 'w-0'}"
    aria-hidden={persistent ? undefined : !open}
    inert={!persistent && !open ? true : undefined}
>
    <div
        bind:this={panelEl}
        {id}
        class="flex h-full {widthClass} flex-col bg-paper outline-none
               {side === 'right' ? 'border-l-[3px]' : 'border-r-[3px]'} border-ink"
        role={persistent ? 'region' : 'dialog'}
        aria-label={title}
        tabindex={persistent ? undefined : -1}
    >
        {#if !persistent}
            <div class="flex items-center justify-between gap-2 border-b-2 border-ink px-4 py-3">
                <span class="group-label">{title}</span>
                <button type="button" class="label-tool" aria-label="Close" title="Close" onclick={() => onClose?.()}>&times;</button>
            </div>
        {/if}
        <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {@render children?.()}
        </div>
    </div>
</div>

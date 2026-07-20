<script>
    // A left side panel that lives IN the layout (not an overlay): the outer
    // column animates its width 0 <-> panel width, so opening it pushes the
    // label workspace to the right instead of covering it. It sits inside the
    // workspace row, below the header. Esc closes it. Hidden entirely in print.
    let { open = false, title = '', onClose, children } = $props();

    let panelEl;
    // Move focus into the panel when it opens and restore it to whatever opened
    // it (the toolbar toggle) when it closes — standard drawer focus handling.
    $effect(() => {
        if (!open) { return; }
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
           {open ? 'w-[min(22rem,calc(100vw-2.5rem))]' : 'w-0'}"
    aria-hidden={!open}
    inert={!open ? true : undefined}
>
    <div
        bind:this={panelEl}
        class="flex h-full w-[min(22rem,calc(100vw-2.5rem))] flex-col bg-paper border-r-[3px] border-ink outline-none"
        role="dialog"
        aria-label={title}
        tabindex="-1"
    >
        <div class="flex items-center justify-between gap-2 border-b-2 border-ink px-4 py-3">
            <span class="group-label">{title}</span>
            <button type="button" class="label-tool" aria-label="Close" title="Close" onclick={() => onClose?.()}>&times;</button>
        </div>
        <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {@render children?.()}
        </div>
    </div>
</div>

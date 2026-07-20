<script>
    // A left side panel that lives IN the layout (not an overlay): the outer
    // column animates its width 0 <-> panel width, so opening it pushes the
    // label workspace to the right instead of covering it. It sits inside the
    // workspace row, below the header. Esc closes it. Hidden entirely in print.
    let { open = false, title = '', onClose, children } = $props();

    $effect(() => {
        if (!open) { return; }
        const onKey = (e) => { if (e.key === 'Escape') { onClose?.(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    });
</script>

<div
    class="drawer-col shrink-0 overflow-hidden transition-[width] duration-200 ease-out
           {open ? 'w-[min(22rem,calc(100vw-2.5rem))]' : 'w-0'}"
    aria-hidden={!open}
    inert={!open ? true : undefined}
>
    <div
        class="flex h-full w-[min(22rem,calc(100vw-2.5rem))] flex-col bg-paper border-r-[3px] border-ink"
        role="dialog"
        aria-label={title}
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

<script>
    // A non-blocking left slide-out panel. It floats over the left edge without a
    // scrim, so the label sheet on the right stays visible and editable while the
    // drawer is open (needed for dragging presets onto the sheet). Esc closes it.
    let { open = false, title = '', onClose, children } = $props();

    $effect(() => {
        if (!open) { return; }
        const onKey = (e) => { if (e.key === 'Escape') { onClose?.(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    });
</script>

<div
    class="fixed inset-y-0 left-0 z-40 flex w-[min(22rem,calc(100vw-3rem))] flex-col
           bg-paper border-r-[3px] border-ink transition-transform duration-200 ease-out
           {open ? 'translate-x-0 shadow-[6px_0_28px_rgba(45,58,46,0.28)]' : '-translate-x-full pointer-events-none'}"
    role="dialog"
    aria-label={title}
    aria-hidden={!open}
    inert={!open ? true : undefined}
>
    <div class="flex items-center justify-between gap-2 border-b-2 border-ink px-4 py-3">
        <span class="group-label">{title}</span>
        <button type="button" class="label-tool" aria-label="Close" title="Close" onclick={() => onClose?.()}>&times;</button>
    </div>
    <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {@render children?.()}
    </div>
</div>

<script>
    // A small "⋯" overflow menu of labeled actions (progressive disclosure).
    // items: [{ label, action, danger? }]
    let { items } = $props();
    let open = $state(false);
    let menuEl;

    function choose(item) { open = false; item.action(); }

    $effect(() => {
        if (!open) { return; }
        const onDoc = (e) => { if (menuEl && !menuEl.contains(e.target)) { open = false; } };
        const onKey = (e) => { if (e.key === 'Escape') { open = false; } };
        document.addEventListener('pointerdown', onDoc, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDoc, true);
            document.removeEventListener('keydown', onKey);
        };
    });
</script>

<div class="relative" bind:this={menuEl}>
    <button
        type="button"
        class="label-tool"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={() => (open = !open)}
    >&#8943;</button>
    {#if open}
        <div
            class="absolute top-[calc(100%+4px)] right-0 z-20 min-w-[10rem] flex flex-col
                   bg-paper border-2 border-ink rounded-md overflow-hidden"
            style="box-shadow: 0 6px 18px rgba(45, 58, 46, 0.35)"
            role="menu"
        >
            {#each items as item}
                <button
                    type="button"
                    class="text-left px-[0.7rem] py-[0.45rem] font-bold text-[0.85rem] bg-paper
                           border-0 cursor-pointer whitespace-nowrap hover:bg-ink/[0.08]
                           {item.danger ? 'text-orange' : 'text-ink'}"
                    role="menuitem"
                    onclick={() => choose(item)}
                >{item.label}</button>
            {/each}
        </div>
    {/if}
</div>

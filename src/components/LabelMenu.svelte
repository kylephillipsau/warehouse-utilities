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

<div class="label-menu" bind:this={menuEl}>
    <button
        type="button"
        class="label-tool label-menu-btn"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={() => (open = !open)}
    >&#8943;</button>
    {#if open}
        <div class="label-menu-list" role="menu">
            {#each items as item}
                <button type="button" class="label-menu-item" class:danger={item.danger} role="menuitem" onclick={() => choose(item)}>{item.label}</button>
            {/each}
        </div>
    {/if}
</div>

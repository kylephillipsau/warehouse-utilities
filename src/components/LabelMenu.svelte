<script>
    // A small "⋯" overflow menu of labeled actions (progressive disclosure).
    // items: [{ label, action, danger? }]
    //
    // The menu is rendered with position:fixed and positioned from the button's
    // viewport rect, so it is never clipped by the label's overflow:hidden media
    // page — critical for small labels. It flips above the button when there
    // isn't room below, and supports full keyboard navigation.
    let { items } = $props();
    let open = $state(false);
    let btnEl, menuEl;
    let pos = $state({ top: 0, left: 0 });

    function place() {
        if (!btnEl || !menuEl) { return; }
        const r = btnEl.getBoundingClientRect();
        const mw = menuEl.offsetWidth;
        const mh = menuEl.offsetHeight;
        const gap = 4, edge = 8;
        let top = r.bottom + gap;
        if (top + mh > window.innerHeight - edge) {
            const above = r.top - gap - mh;
            top = above >= edge ? above : Math.max(edge, window.innerHeight - edge - mh);
        }
        let left = r.right - mw; // right-align the menu to the button
        left = Math.max(edge, Math.min(left, window.innerWidth - mw - edge));
        pos = { top, left };
    }

    function choose(item) { open = false; item.action(); }

    function onMenuKey(event) {
        const btns = [...menuEl.querySelectorAll('[role="menuitem"]')];
        const i = btns.indexOf(document.activeElement);
        if (event.key === 'ArrowDown') { event.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
        else if (event.key === 'Home') { event.preventDefault(); btns[0]?.focus(); }
        else if (event.key === 'End') { event.preventDefault(); btns[btns.length - 1]?.focus(); }
    }

    $effect(() => {
        if (!open) { return; }
        requestAnimationFrame(() => {
            place();
            menuEl?.querySelector('[role="menuitem"]')?.focus();
        });
        const onDoc = (e) => { if (!menuEl?.contains(e.target) && !btnEl?.contains(e.target)) { open = false; } };
        const onKey = (e) => { if (e.key === 'Escape') { open = false; btnEl?.focus(); } };
        const reposition = () => place();
        document.addEventListener('pointerdown', onDoc, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            document.removeEventListener('pointerdown', onDoc, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    });
</script>

<div class="contents">
    <button
        type="button"
        class="label-tool"
        bind:this={btnEl}
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={() => (open = !open)}
    >&#8943;</button>
    {#if open}
        <div
            bind:this={menuEl}
            class="fixed z-[60] flex min-w-[10rem] max-h-[70vh] flex-col overflow-y-auto
                   bg-paper border-2 border-ink rounded-md shadow-popover"
            style="top: {pos.top}px; left: {pos.left}px"
            role="menu"
            tabindex="-1"
            onkeydown={onMenuKey}
        >
            {#each items as item}
                <button
                    type="button"
                    class="whitespace-nowrap px-[0.7rem] py-[0.45rem] text-left text-[0.85rem] font-bold
                           bg-paper border-0 cursor-pointer hover:bg-ink/[0.08]
                           {item.danger ? 'text-orange' : 'text-ink'}"
                    role="menuitem"
                    onclick={() => choose(item)}
                >{item.label}</button>
            {/each}
        </div>
    {/if}
</div>

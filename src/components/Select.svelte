<script module>
    let seq = 0;
</script>

<script>
    // A branded, accessible replacement for a native <select>. Options may carry
    // a `group` label; consecutive options with the same group get a heading.
    // Implements the listbox pattern: the trigger keeps focus and points at the
    // active option via aria-activedescendant; arrows move it, Enter selects,
    // Esc closes. The list is rendered with position:fixed from the trigger's
    // viewport rect, so it is never clipped by an overflow:auto ancestor (e.g.
    // the mobile setup popover); it flips above when there's no room below.
    let {
        value = $bindable(),
        options = [],
        ariaLabel = '',
        id = undefined,
        class: className = '',
    } = $props();

    const uid = `sel-${seq++}`;
    const optId = (i) => `${uid}-opt-${i}`;
    const listId = `${uid}-list`;

    let open = $state(false);
    let active = $state(-1);
    let pos = $state({ top: 0, left: 0, minWidth: 0 });
    let btnEl, listEl;

    const current = $derived(options.find((o) => String(o.value) === String(value)));
    const activeId = $derived(open && active >= 0 ? optId(active) : undefined);

    const grouped = $derived.by(() => {
        const out = [];
        let cur = null;
        options.forEach((o, i) => {
            const g = o.group || '';
            if (!cur || cur.label !== g) { cur = { label: g, items: [] }; out.push(cur); }
            cur.items.push({ ...o, index: i });
        });
        return out;
    });

    function toggle() {
        open = !open;
        if (open) { active = options.findIndex((o) => String(o.value) === String(value)); }
    }
    function choose(o) { value = o.value; open = false; btnEl?.focus(); }

    function place() {
        if (!btnEl || !listEl) { return; }
        const r = btnEl.getBoundingClientRect();
        const mw = listEl.offsetWidth;
        const mh = listEl.offsetHeight;
        const gap = 4, edge = 8;
        let top = r.bottom + gap;
        if (top + mh > window.innerHeight - edge) {
            const above = r.top - gap - mh;
            top = above >= edge ? above : Math.max(edge, window.innerHeight - edge - mh);
        }
        let left = Math.max(edge, Math.min(r.left, window.innerWidth - mw - edge));
        pos = { top, left, minWidth: r.width };
    }

    function onKey(event) {
        if (!open) {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
            return;
        }
        if (event.key === 'Escape') { event.preventDefault(); open = false; btnEl?.focus(); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(options.length - 1, active + 1); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(0, active - 1); }
        else if (event.key === 'Home') { event.preventDefault(); active = 0; }
        else if (event.key === 'End') { event.preventDefault(); active = options.length - 1; }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (options[active]) { choose(options[active]); } }
    }

    $effect(() => {
        if (!open) { return; }
        requestAnimationFrame(() => { place(); });
        const onDoc = (e) => {
            if (btnEl && !btnEl.contains(e.target) && listEl && !listEl.contains(e.target)) { open = false; }
        };
        const reposition = () => place();
        document.addEventListener('pointerdown', onDoc, true);
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            document.removeEventListener('pointerdown', onDoc, true);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    });
    $effect(() => {
        if (open && active >= 0) { document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' }); }
    });
</script>

<div class="relative inline-block {className}">
    <button
        bind:this={btnEl}
        {id}
        type="button"
        class="flex w-full items-center justify-between gap-2 text-left font-sans text-[0.95rem]
               text-ink bg-white border-2 border-ink rounded-md px-[0.6rem] py-[0.4rem] cursor-pointer"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        onclick={toggle}
        onkeydown={onKey}
    >
        <span class="truncate">{current ? current.label : ''}</span>
        <span class="shrink-0 text-[0.7em]" aria-hidden="true">▾</span>
    </button>
    {#if open}
        <div
            bind:this={listEl}
            id={listId}
            class="fixed z-[60] w-max max-w-[min(24rem,calc(100vw-1rem))] max-h-[16rem] overflow-y-auto
                   bg-paper border-2 border-ink rounded-md py-1 shadow-popover"
            style="top: {pos.top}px; left: {pos.left}px; min-width: {pos.minWidth}px"
            role="listbox"
            aria-label={ariaLabel}
        >
            {#each grouped as g}
                {#if g.label}
                    <div class="group-label px-[0.7rem] pt-2 pb-1">{g.label}</div>
                {/if}
                {#each g.items as o}
                    <button
                        type="button"
                        id={optId(o.index)}
                        role="option"
                        tabindex="-1"
                        aria-selected={String(o.value) === String(value)}
                        class="block w-full whitespace-nowrap px-[0.7rem] py-[0.35rem] text-left text-[0.9rem] cursor-pointer
                               {o.index === active
                                   ? 'bg-purple text-paper'
                                   : String(o.value) === String(value)
                                       ? 'font-bold text-purple hover:bg-ink/[0.08]'
                                       : 'text-ink hover:bg-ink/[0.08]'}"
                        onclick={() => choose(o)}
                        onpointermove={() => (active = o.index)}
                    >{o.label}</button>
                {/each}
            {/each}
        </div>
    {/if}
</div>

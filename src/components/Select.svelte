<script>
    // A branded replacement for a native <select>. Options may carry a `group`
    // label; consecutive options with the same group are shown under a heading.
    // Supports mouse + keyboard (arrows / Enter / Esc), closes on outside click.
    let {
        value = $bindable(),
        options = [],
        ariaLabel = '',
        id = undefined,
        class: className = '',
    } = $props();

    let open = $state(false);
    let active = $state(-1);
    let btnEl, listEl;

    const current = $derived(options.find((o) => String(o.value) === String(value)));

    // Group consecutive options by their `group` (blank = ungrouped)
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

    function onKey(event) {
        if (!open) {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
            return;
        }
        if (event.key === 'Escape') { event.preventDefault(); open = false; btnEl?.focus(); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(options.length - 1, active + 1); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(0, active - 1); }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (options[active]) { choose(options[active]); } }
    }

    $effect(() => {
        if (!open) { return; }
        const onDoc = (e) => {
            if (btnEl && !btnEl.contains(e.target) && listEl && !listEl.contains(e.target)) { open = false; }
        };
        document.addEventListener('pointerdown', onDoc, true);
        return () => document.removeEventListener('pointerdown', onDoc, true);
    });
</script>

<div class="relative inline-block {className}">
    <button
        bind:this={btnEl}
        {id}
        type="button"
        class="flex w-full items-center justify-between gap-2 text-left font-sans text-[0.95rem]
               text-ink bg-white border-2 border-ink rounded-md px-[0.6rem] py-[0.4rem] cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
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
            class="absolute left-0 top-[calc(100%+4px)] z-30 min-w-full w-max max-w-[min(22rem,calc(100vw-2rem))]
                   max-h-[16rem] overflow-y-auto bg-paper border-2 border-ink rounded-md py-1
                   shadow-[0_10px_24px_rgba(45,58,46,0.3)]"
            role="listbox"
            tabindex="-1"
            aria-label={ariaLabel}
        >
            {#each grouped as g}
                {#if g.label}
                    <div class="group-label px-[0.7rem] pt-2 pb-1">{g.label}</div>
                {/if}
                {#each g.items as o}
                    <button
                        type="button"
                        role="option"
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

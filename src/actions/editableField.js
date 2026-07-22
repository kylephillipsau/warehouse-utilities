import { resizeText } from '../lib/textfit.js';

// One editable template field (a band in a multi-field label). This action OWNS
// the element's textContent so that Svelte never reactively clobbers it mid-edit
// (which would drop the caret), and so the raw↔resolved swap and the auto-fit
// never race each other:
//   - unfocused: the band shows the RESOLVED template (tokens → live values)
//   - focused:   it shows the RAW template so you can edit the {{tokens}}
//   - on input:  the raw text is written back via onInput
//   - on blur:   it re-resolves
// It also auto-fits the text to the band (same binary-search fitter as fitText).
//
// params: { value, resolve, onInput, fitKey }
//   value    raw template string
//   resolve  (raw) => resolved display string
//   onInput  (raw) => void   — persist the edited raw value
//   fitKey   any — bump to force a re-fit (page/size/orientation change)
export function editableField(node, params) {
    let { value, resolve, onInput } = params;
    let focused = false;

    const fit = () => resizeText({ element: node, step: 0.5 });
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };

    const show = (text) => {
        if (node.textContent !== text) { node.textContent = text; }
        schedule();
    };

    // initial paint: resolved
    show(resolve(value));

    const onFocus = () => {
        focused = true;
        show(value);                 // reveal the raw template for editing
        // caret to end
        requestAnimationFrame(() => {
            const sel = window.getSelection();
            if (!sel) { return; }
            const range = document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        });
    };
    const onInputEvt = () => {
        value = node.textContent;
        onInput(value);
        schedule();
    };
    const onBlur = () => {
        focused = false;
        show(resolve(value));        // back to the resolved display
    };

    node.addEventListener('focus', onFocus);
    node.addEventListener('input', onInputEvt);
    node.addEventListener('blur', onBlur);

    let ro;
    const parent = node.parentNode;
    if (parent && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(schedule);
        ro.observe(parent);
    }

    return {
        update(next) {
            ({ value, resolve, onInput } = next);
            // While the user is typing, leave their raw text alone; otherwise
            // refresh the resolved display (e.g. an external edit from the dialog,
            // or a size/orientation change bumping fitKey).
            if (!focused) { show(resolve(value)); } else { schedule(); }
        },
        destroy() {
            cancelAnimationFrame(raf);
            if (ro) { ro.disconnect(); }
            node.removeEventListener('focus', onFocus);
            node.removeEventListener('input', onInputEvt);
            node.removeEventListener('blur', onBlur);
        },
    };
}

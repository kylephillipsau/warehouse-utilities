// Text size maximisation

const resizeText = ({ element, elements, minSize = 10, maxSize = 512, step = 1, unit = 'px' }) => {
    (elements || [element]).forEach(el => {
        let i = minSize
        let overflow = false
        const parent = el.parentNode
        while (!overflow && i < maxSize) {
            el.style.fontSize = `${i}${unit}`
            overflow = isOverflown(parent)
            if (!overflow) i += step
        }
        el.style.fontSize = `${i - step}${unit}`
    })
}

const isOverflown = ({ clientWidth, clientHeight, scrollWidth, scrollHeight }) => (scrollWidth > clientWidth) || (scrollHeight > clientHeight)

// Label movement - drag a label by its handle to reorder, mouse or touch
function startLabelDrag(li, startEvent) {
    startEvent.preventDefault();
    const list = document.getElementById("labelList");
    li.classList.add("dragging");

    const move = (ev) => {
        const target = [...list.children].filter(el => el !== li)
            .find(el => ev.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
        if (target) { list.insertBefore(li, target); } else { list.appendChild(li); }
    };
    const stop = () => {
        li.classList.remove("dragging");
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.removeEventListener("pointercancel", stop);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
}

// A label can hold an optional image, the auto-fitting text, or both. The text
// lives inside .label-text-area (a flex child) so resizeText fits it to the
// space left beside the image; with no image the text area fills the whole box
// and behaves exactly as before. imageSrc, when given, is a data URI.
function createLabel(text, imageSrc) {
    var item = document.createElement("li");
    item.classList.add('text-container');

    var content = document.createElement("div");
    content.className = "label-content";

    var textArea = document.createElement("div");
    textArea.className = "label-text-area";

    var itemText = document.createElement("span");
    itemText.classList.add('text');
    itemText.contentEditable = true;
    // Internal callers pass trusted text; imported files are set via
    // textContent (see openLabelFile) so no untrusted HTML is injected.
    itemText.innerHTML = text;
    textArea.appendChild(itemText);
    content.appendChild(textArea);
    item.appendChild(content);

    if (imageSrc) { setLabelImage(item, imageSrc); }

    // Screen-only management strip; hidden by the print stylesheet and
    // positioned inside the label box so text fitting is unaffected
    var tools = document.createElement("div");
    tools.className = "label-tools";
    tools.innerHTML =
        '<button type="button" class="tool-drag" title="Drag to reorder" aria-label="Drag to reorder">&#10495;</button>' +
        '<button type="button" class="tool-image" title="Add or replace image" aria-label="Add or replace image">&#128247;</button>' +
        '<button type="button" class="tool-duplicate" title="Duplicate label" aria-label="Duplicate label">&#10697;</button>' +
        '<button type="button" class="tool-delete" title="Delete label" aria-label="Delete label">&times;</button>';
    item.appendChild(tools);
    return item;
}

// Attach (or replace) a label's image. Given a data URI, sets the <img>; the
// remove overlay is screen-only. Refits the text once the image has laid out.
function setLabelImage(li, src) {
    const content = li.querySelector(".label-content");
    let img = content.querySelector(".label-image");
    if (!img) {
        img = document.createElement("img");
        img.className = "label-image";
        img.alt = "";
        img.addEventListener("load", () => {
            resizeText({ element: li.querySelector(".text"), step: 0.5 });
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "label-image-remove";
        remove.title = "Remove image";
        remove.setAttribute("aria-label", "Remove image");
        remove.innerHTML = "&times;";
        // Image first so it sits before the text area in the flex row
        content.insertBefore(img, content.firstChild);
        content.insertBefore(remove, img.nextSibling);
    }
    img.src = src;
}

function removeLabelImage(li) {
    const content = li.querySelector(".label-content");
    const img = content.querySelector(".label-image");
    const remove = content.querySelector(".label-image-remove");
    if (img) { img.remove(); }
    if (remove) { remove.remove(); }
    updateLabels();
}

// Read an image file into a downscaled data URI. Phone photos are capped to a
// sensible longest side so the saved JSON stays reasonable; PNG keeps its
// format (transparency), SVG is passed through untouched, everything else is
// re-encoded as JPEG. Resolves with the data URI.
var IMAGE_MAX_SIDE = 1200;

function fileToLabelImage(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith("image/")) {
            reject(new Error("Not an image file"));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error("Could not read file"));
        reader.onload = () => {
            const dataUrl = reader.result;
            // SVG scales losslessly - no point rasterising it
            if (file.type === "image/svg+xml") { resolve(dataUrl); return; }
            const image = new Image();
            image.onerror = () => resolve(dataUrl); // fall back to the raw file
            image.onload = () => {
                const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(image.width, image.height));
                if (scale >= 1) { resolve(dataUrl); return; }
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(image.width * scale);
                canvas.height = Math.round(image.height * scale);
                const ctx = canvas.getContext("2d");
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
                resolve(canvas.toDataURL(outType, 0.85));
            };
            image.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });
}

// "Add image" in the toolbar creates a fresh image-only label
function addImageLabel(file) {
    if (!file) { return; }
    fileToLabelImage(file).then((src) => {
        const label = createLabel("", src);
        document.getElementById("labelList").appendChild(label);
        updateLabels();
    }).catch(() => { /* not an image - ignore */ });
}

// The per-label image tool shares one hidden file input; remember which label
// it was opened for so applyPickedImage knows where to put the result.
var pendingImageLabel = null;

function applyPickedImage(file) {
    const li = pendingImageLabel;
    pendingImageLabel = null;
    if (!file || !li) { return; }
    fileToLabelImage(file).then((src) => {
        setLabelImage(li, src);
        updateLabels();
    }).catch(() => { /* not an image - ignore */ });
}

function addItem(text, quantity) {
    if (!quantity) { // If quantity unspecified, Sets quantity to 1
        var quantity = 1;
    } else if (quantity > 100) { // If quantity greater than 100, cap at 100
        var quantity = 100;
        document.getElementById("labelQuantity").value = 100;
    }

    for (let i = 0; i < quantity; i++) {
        document.getElementById("labelList").appendChild(createLabel(text));
    }
    document.getElementById("labelText").value = null;
    // document.getElementById("subText").value = null;
    document.getElementById("labelQuantity").value = null;
    document.getElementById("labelText").focus();
    updateLabels();
}

function duplicateLabel(li) {
    const img = li.querySelector(".label-image");
    li.after(createLabel(li.querySelector(".text").innerHTML, img ? img.src : null));
    updateLabels();
}

// Deleting is immediate but undoable via a transient toast
var deletedLabels = [];
var undoToastTimer = null;

function deleteLabel(li) {
    deletedLabels.push({ node: li, next: li.nextElementSibling });
    li.remove();
    document.getElementById("undo-toast").classList.add("visible");
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(hideUndoToast, 6000);
}

function hideUndoToast() {
    document.getElementById("undo-toast").classList.remove("visible");
    deletedLabels = [];
}

function undoDelete() {
    const last = deletedLabels.pop();
    if (last) {
        const list = document.getElementById("labelList");
        if (last.next && last.next.parentElement === list) {
            list.insertBefore(last.node, last.next);
        } else {
            list.appendChild(last.node);
        }
        updateLabels();
    }
    if (deletedLabels.length === 0) {
        hideUndoToast();
    } else {
        clearTimeout(undoToastTimer);
        undoToastTimer = setTimeout(hideUndoToast, 6000);
    }
}

function enterPress(event) {
    if (event.keyCode == 13) {
        addItem(document.getElementById('labelText').value, document.getElementById('labelQuantity').value);
    }
}

// Import dialog

var IMPORT_HINT_DEFAULT = "Paste or type below, one label per line, or drop in a text file.";

function toggleMultilineImport() {
    document.getElementById("multiline-input").value = "";
    document.getElementById("import-hint").textContent = IMPORT_HINT_DEFAULT;
    updateImportCount();
    document.getElementById("import-dialog").showModal();
    document.getElementById("multiline-input").focus();
}

function importLines() {
    return document.getElementById("multiline-input").value
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

// The submit button doubles as a live preview of how many labels will land
function updateImportCount() {
    const count = importLines().length;
    const submit = document.getElementById("multiline-input-submit");
    submit.textContent = count === 0 ? "Import labels"
        : count === 1 ? "Import 1 label"
        : "Import " + count + " labels";
    submit.disabled = count === 0;
}

function multilineImport() {
    const list = document.getElementById("labelList");
    importLines().forEach(line => list.appendChild(createLabel(line)));
    updateLabels();
    document.getElementById("import-dialog").close();
}

function multilineImportCancel() {
    document.getElementById("import-dialog").close();
}

// File import - JSON label files open directly (replacing the set); text files
// read into the textarea for review, appending if lines are already present
function readImportFile(file) {
    if (!file) { return; }
    const looksLikeJson = /\.json$/i.test(file.name) || file.type === "application/json";
    if (looksLikeJson) { readLabelFile(file); return; }
    const looksLikeText = (file.type && file.type.startsWith("text/")) ||
        (!file.type && /\.(txt|csv)$/i.test(file.name)) || /\.(txt|csv)$/i.test(file.name);
    if (!looksLikeText) {
        document.getElementById("import-hint").textContent =
            "That file doesn't look right. Use a .txt/.csv list or a .json label file.";
        return;
    }
    file.text().then((text) => {
        const box = document.getElementById("multiline-input");
        const existing = box.value.trim();
        box.value = existing ? existing + "\n" + text.trim() : text.trim();
        document.getElementById("import-hint").textContent = IMPORT_HINT_DEFAULT;
        updateImportCount();
        box.focus();
    });
}

// Parse and open a JSON label file. On success close the import dialog (it may
// have been opened by a drag & drop); on failure leave the hint showing.
function readLabelFile(file) {
    file.text().then((text) => {
        let data;
        try { data = JSON.parse(text); }
        catch (e) {
            document.getElementById("import-hint").textContent =
                "That .json file couldn't be read.";
            return;
        }
        if (openLabelFile(data)) {
            document.getElementById("import-dialog").close();
        }
    });
}

// Drag & drop a text file anywhere on the page; preventDefault on dragover
// also stops the browser navigating away (and losing the labels) on a
// stray drop outside the dialog
document.addEventListener("dragover", (event) => {
    event.preventDefault();
    const drop = document.getElementById("file-drop");
    if (drop) { drop.classList.add("dragover"); }
});

document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) {
        const drop = document.getElementById("file-drop");
        if (drop) { drop.classList.remove("dragover"); }
    }
});

document.addEventListener("drop", (event) => {
    event.preventDefault();
    const drop = document.getElementById("file-drop");
    if (drop) { drop.classList.remove("dragover"); }
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (!file) { return; }
    if (!document.getElementById("import-dialog").open) { toggleMultilineImport(); }
    readImportFile(file);
});

// Clicking the dimmed backdrop closes the dialog (such clicks target the
// dialog element itself rather than its contents)
document.addEventListener("click", (event) => {
    if (event.target.id === "import-dialog" || event.target.id === "export-dialog") {
        event.target.close();
    }
});

// Label size presets - "standard" leaves the stylesheet defaults untouched
// (100 x 22 mm, widening to 143 mm in landscape) so the built-in size can
// never drift; every other size fixes the width for both orientations

var LABEL_SIZE_PRESETS = {
    "address": { width: 89, height: 28 },
    "large-address": { width: 89, height: 36 },
    "shipping": { width: 100, height: 150 },
};

var LABEL_SIZE_STORAGE_KEY = "labelMakerSize";

function clampMm(value, fallback) {
    const n = parseFloat(value);
    return isNaN(n) ? fallback : Math.min(500, Math.max(10, n));
}

function applyLabelSize() {
    const preset = document.getElementById("label-size").value;
    document.getElementById("custom-size").hidden = preset !== "custom";

    let size = LABEL_SIZE_PRESETS[preset] || null;
    if (preset === "custom") {
        size = {
            width: clampMm(document.getElementById("custom-width").value, 100),
            height: clampMm(document.getElementById("custom-height").value, 22),
        };
    }

    const root = document.documentElement.style;
    if (size) {
        root.setProperty("--label-w", size.width + "mm");
        root.setProperty("--label-h", size.height + "mm");
        // Landscape rotates a preset/custom label 90 degrees; only the
        // built-in standard size keeps its legacy widen-to-143mm behaviour
        root.setProperty("--label-w-landscape", size.height + "mm");
        root.setProperty("--label-h-landscape", size.width + "mm");
    } else {
        root.removeProperty("--label-w");
        root.removeProperty("--label-h");
        root.removeProperty("--label-w-landscape");
        root.removeProperty("--label-h-landscape");
    }
    updateLabels();
}

function labelSizeChanged() {
    // First switch to custom starts from the standard size rather than blank
    if (document.getElementById("label-size").value === "custom") {
        const w = document.getElementById("custom-width");
        const h = document.getElementById("custom-height");
        if (w.value === "") { w.value = 100; }
        if (h.value === "") { h.value = 22; }
    }
    applyLabelSize();
    saveLabelSize();
}

function saveLabelSize() {
    try {
        localStorage.setItem(LABEL_SIZE_STORAGE_KEY, JSON.stringify({
            preset: document.getElementById("label-size").value,
            width: document.getElementById("custom-width").value,
            height: document.getElementById("custom-height").value,
        }));
    } catch (e) { /* storage unavailable (private mode etc.) - size just won't persist */ }
}

function restoreLabelSize() {
    try {
        const saved = JSON.parse(localStorage.getItem(LABEL_SIZE_STORAGE_KEY));
        if (!saved) { return; }
        const select = document.getElementById("label-size");
        if ([...select.options].some(o => o.value === saved.preset)) {
            select.value = saved.preset;
        }
        if (saved.width) { document.getElementById("custom-width").value = saved.width; }
        if (saved.height) { document.getElementById("custom-height").value = saved.height; }
        applyLabelSize();
    } catch (e) { /* corrupt saved value - fall back to the default size */ }
}

window.addEventListener("DOMContentLoaded", restoreLabelSize);

// Page Orientation Changer

var labelOrientation = "portrait";

var cssPagedMedia = (function () {
    var style = document.createElement('style');
    document.head.appendChild(style);
    return function (rule) {
        style.innerHTML = rule;
    };
}());

cssPagedMedia.size = function (size) {
    cssPagedMedia('@page {size: ' + size + '}');
};

function selectOrientation() {
    var1 = document.getElementById("portrait");
    var2 = document.getElementById("landscape");
    if (var1.checked === true) {
        labelOrientation = "portrait";
        cssPagedMedia.size("portrait");
    }
    else if (var2.checked === true) {
        labelOrientation = "landscape";
        cssPagedMedia.size("landscape");
    }
}

function updateLabels() {
    selectOrientation();
    // If label is empty, delete label
    var labelsListText = document.querySelectorAll(".text");
    var labelsList = document.querySelectorAll(".text-container");
    // Resize label text
    resizeText({ elements: document.querySelectorAll('.text'), step: 0.5 })
    for (let i = 0; i < labelsList.length; i++) {
        // Drop empty labels, but keep image-only ones (their text is blank)
        if (labelsListText[i].innerHTML.length == 0 && !labelsList[i].querySelector(".label-image")) {
            labelsList[i].remove();
            continue;
        }

        if (labelOrientation == "landscape") {
            labelsList[i].classList.add("landscape");
        } else if (labelsList[i].classList.contains("landscape")) {
            labelsList[i].classList.remove("landscape");
        }

        labelsListText[i].contentEditable = true;
    }
    resizeText({ elements: document.querySelectorAll('.text'), step: 0.5 })
}

// Saving - two formats. Plain text (one label per line) round-trips with the
// Import list flow but can't carry images; the label file is JSON with images
// embedded as base64 data URIs, so a set of labels saves and restores whole.

var LABEL_FILE_FORMAT = "warehouse-utilities-labels";
var LABEL_FILE_VERSION = 1;

function labelsHaveImages() {
    return !!document.querySelector("#labelList .label-image");
}

// Small download helper shared by both formats
function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// The Export button opens a format chooser. The smart default (highlighted) is
// the label file when any label has an image, otherwise plain text.
function openExportDialog() {
    const hasImages = labelsHaveImages();
    const jsonBtn = document.getElementById("export-json");
    const textBtn = document.getElementById("export-text");
    jsonBtn.classList.toggle("btn-primary", hasImages);
    textBtn.classList.toggle("btn-primary", !hasImages);
    document.getElementById("export-hint").textContent = hasImages
        ? "Your labels include images - save a label file to keep them. Plain text saves the words only."
        : "Save a label file to keep images later, or plain text for a simple list.";
    document.getElementById("export-dialog").showModal();
}

function serializeLabels() {
    const labels = [...document.querySelectorAll("#labelList .text-container")].map((li) => {
        const img = li.querySelector(".label-image");
        return {
            // textContent (not innerHTML) keeps the file to plain data
            text: li.querySelector(".text").textContent,
            image: img ? img.src : null,
        };
    });
    return {
        format: LABEL_FILE_FORMAT,
        version: LABEL_FILE_VERSION,
        size: {
            preset: document.getElementById("label-size").value,
            width: document.getElementById("custom-width").value,
            height: document.getElementById("custom-height").value,
        },
        orientation: document.getElementById("landscape").checked ? "landscape" : "portrait",
        labels,
    };
}

function exportJson() {
    const blob = new Blob([JSON.stringify(serializeLabels(), null, 2)], { type: "application/json" });
    downloadBlob(blob, "labels.json");
    document.getElementById("export-dialog").close();
}

// Plain text export - one non-empty label per line, matching the import format.
// Image-only labels have no text, so they simply don't appear.
function exportText() {
    const lines = [...document.querySelectorAll("#labelList .text")]
        .map(t => t.textContent)
        .filter(line => line.trim().length > 0);
    downloadBlob(new Blob([lines.join("\n")], { type: "text/plain" }), "labels.txt");
    document.getElementById("export-dialog").close();
}

// Load a saved label file, replacing the current set (like opening a document)
// and restoring its size and orientation. Text is set via textContent so a
// crafted file can't inject markup.
function openLabelFile(data) {
    if (!data || data.format !== LABEL_FILE_FORMAT || !Array.isArray(data.labels)) {
        document.getElementById("import-hint").textContent =
            "That JSON file isn't a label file this app recognises.";
        return false;
    }
    const list = document.getElementById("labelList");
    if (list.children.length > 0 &&
        !window.confirm("Opening this file will replace your current labels. Continue?")) {
        return false;
    }
    list.innerHTML = "";
    data.labels.forEach((entry) => {
        const label = createLabel("", entry && entry.image ? entry.image : null);
        if (entry && typeof entry.text === "string") {
            label.querySelector(".text").textContent = entry.text;
        }
        list.appendChild(label);
    });
    restoreImportedSize(data.size);
    if (data.orientation === "portrait" || data.orientation === "landscape") {
        document.getElementById(data.orientation).checked = true;
    }
    updateLabels();
    return true;
}

// Apply a size block from an imported file through the existing size machinery
function restoreImportedSize(size) {
    if (!size) { return; }
    const select = document.getElementById("label-size");
    if (size.preset && [...select.options].some(o => o.value === size.preset)) {
        select.value = size.preset;
    }
    if (size.width) { document.getElementById("custom-width").value = size.width; }
    if (size.height) { document.getElementById("custom-height").value = size.height; }
    applyLabelSize();
    saveLabelSize();
}

// Printing Functions

window.onbeforeprint = (event) => {
    // Update labels
    updateLabels()
};

window.onafterprint = (event) => {
    // Display the header after printing has finished
    header.style.display = "flex";
};

// Toolbar drops a shadow once labels scroll beneath it
window.addEventListener("scroll", () => {
    document.getElementById("header").classList.toggle("scrolled", window.scrollY > 0);
});

// Re-fit label text live while it is being edited, so the size never jumps
document.addEventListener("input", (event) => {
    if (event.target.classList && event.target.classList.contains("text")) {
        resizeText({ element: event.target, step: 0.5 });
    }
});

// Clean up emptied labels once editing moves elsewhere (updateLabels also
// runs before printing, so print output never includes empty labels)
document.addEventListener("focusout", (event) => {
    if (event.target.classList && event.target.classList.contains("text")) {
        if (event.target.textContent.trim().length === 0) {
            event.target.innerHTML = ""; // normalise leftover <br> so removal triggers
        }
        updateLabels();
    }
});

// Per-label tool strip, handled by delegation so duplicated labels work too
document.addEventListener("click", (event) => {
    if (!event.target.closest) { return; }
    // The remove-image overlay sits on the image, outside the tool strip
    const removeBtn = event.target.closest(".label-image-remove");
    if (removeBtn) {
        removeLabelImage(removeBtn.closest("li.text-container"));
        return;
    }
    const button = event.target.closest(".label-tools button");
    if (!button) { return; }
    const li = button.closest("li.text-container");
    if (button.classList.contains("tool-delete")) {
        deleteLabel(li);
    } else if (button.classList.contains("tool-duplicate")) {
        duplicateLabel(li);
    } else if (button.classList.contains("tool-image")) {
        // Route the shared hidden picker back to this label
        pendingImageLabel = li;
        document.getElementById("label-image-file").click();
    }
});

document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest ? event.target.closest(".tool-drag") : null;
    if (handle) {
        startLabelDrag(handle.closest("li.text-container"), event);
    }
});

// Keyboard reordering on the drag handle
document.addEventListener("keydown", (event) => {
    const handle = event.target.classList && event.target.classList.contains("tool-drag") ? event.target : null;
    if (!handle) { return; }
    const li = handle.closest("li.text-container");
    if (event.key === "ArrowUp" && li.previousElementSibling) {
        li.previousElementSibling.before(li);
        handle.focus();
        event.preventDefault();
    } else if (event.key === "ArrowDown" && li.nextElementSibling) {
        li.nextElementSibling.after(li);
        handle.focus();
        event.preventDefault();
    }
});
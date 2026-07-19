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

function createLabel(text) {
    var item = document.createElement("li");
    item.classList.add('text-container');

    var itemText = document.createElement("span");
    itemText.classList.add('text');
    itemText.contentEditable = true;
    itemText.innerHTML = text;
    item.appendChild(itemText);

    // Screen-only management strip; hidden by the print stylesheet and
    // positioned inside the label box so text fitting is unaffected
    var tools = document.createElement("div");
    tools.className = "label-tools";
    tools.innerHTML =
        '<button type="button" class="tool-drag" title="Drag to reorder" aria-label="Drag to reorder">&#10495;</button>' +
        '<button type="button" class="tool-duplicate" title="Duplicate label" aria-label="Duplicate label">&#10697;</button>' +
        '<button type="button" class="tool-delete" title="Delete label" aria-label="Delete label">&times;</button>';
    item.appendChild(tools);
    return item;
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
    li.after(createLabel(li.querySelector(".text").innerHTML));
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

// Multiline Input Menu

function toggleMultilineImport() {
    document.getElementById('multiline-input-container').style.display = "block";;
    document.getElementById('multiline-input').value = null;
}

function multilineImport() {
    let textbox = document.getElementById('multiline-input').value;
    let multiLabels = textbox.split(/\r?\n/);

    for (let i = 0; i < multiLabels.length; i++) {
        addItem(multiLabels[i], 1);
    }

    document.getElementById('multiline-input-container').style.display = "none";
}

function multilineImportCancel() {
    document.getElementById('multiline-input-container').style.display = "none";;
}

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
        if (labelsListText[i].innerHTML.length == 0) {
            labelsListText[i].parentElement.remove();
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

// Export the current labels as a plain text file, one label per line,
// matching the Import list format so a file can round-trip back in
function exportList() {
    const lines = [...document.querySelectorAll("#labelList .text")].map(t => t.textContent);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "labels.txt";
    link.click();
    URL.revokeObjectURL(link.href);
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
    const button = event.target.closest ? event.target.closest(".label-tools button") : null;
    if (!button) { return; }
    const li = button.closest("li.text-container");
    if (button.classList.contains("tool-delete")) {
        deleteLabel(li);
    } else if (button.classList.contains("tool-duplicate")) {
        duplicateLabel(li);
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
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

// Label movement
function dragLabels(target) {
    target.classList.add("draggableLabels");
    let items = target.getElementsByTagName("li"), current = null;

    for (let i of items) {
        i.draggable = true;

        i.ondragstart = (ev) => {
            current = i;
            for (let it of items) {
                if (it != current) { it.classList.add("hint"); }
            }
        };

        i.ondragenter = (ev) => {
            if (i != current) { i.classList.add("active"); }
        };

        i.ondragleave = () => {
            i.classList.remove("active");
        };

        i.ondragend = () => {
            for (let it of items) {
                it.classList.remove("hint");
                it.classList.remove("active");
            }
        };

        i.ondragover = (evt) => { evt.preventDefault(); };

        i.ondrop = (evt) => {
            evt.preventDefault();
            if (i != current) {
                let currentpos = 0, droppedpos = 0;
                for (let it = 0; it < items.length; it++) {
                    if (current == items[it]) { currentpos = it; }
                    if (i == items[it]) { droppedpos = it; }
                }
                if (currentpos < droppedpos) {
                    i.parentNode.insertBefore(current, i.nextSibling);
                } else {
                    i.parentNode.insertBefore(current, i);
                }
            }
        };
    }
}

function addItem(text, quantity) {
    if (!quantity) { // If quantity unspecified, Sets quantity to 1
        var quantity = 1;
    } else if (quantity > 100) { // If quantity greater than 100, cap at 100
        var quantity = 100;
        document.getElementById("labelQuantity").value = 100;
    }

    for (let i = 0; i < quantity; i++) {
        var item = document.createElement("li");
        document.getElementById("labelList").appendChild(item);
        var itemText = document.createElement("span")
        item.appendChild(itemText)
        itemText.innerHTML = text;
        item.classList.add('text-container');

        itemText.classList.add('text');
    }
    document.getElementById("labelText").value = null;
    // document.getElementById("subText").value = null;
    document.getElementById("labelQuantity").value = null;
    document.getElementById("labelText").focus();
    updateLabels();
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

// Mode selector

var mode = null

function toggleMode() {
    var1 = document.getElementById("editMode");
    var2 = document.getElementById("moveMode");
    var3 = document.getElementById("deleteMode");
    if (var1.checked === true) {
        mode = "edit"
    } else if (var2.checked === true) {
        mode = "move"
    } else if (var3.checked === true) {
        mode = "delete"
    }
    updateLabels();
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

        if (mode == "edit") { // Text Edit Mode
            labelsListText[i].contentEditable = true;
        } else {
            labelsListText[i].contentEditable = false;
        }

        if (mode == "move") { // Label Rearranging Mode
            dragLabels(document.getElementById("labelList"));
        } else {
            document.getElementById("labelList").classList.remove("draggableLabels");
            labelsList[i].draggable = false;
        }

        if (mode == "delete") { // Click labels to delete mode
            labelsList[i].setAttribute("onclick","this.remove();");
            labelsList[i].classList.add("deleteMode");
        } else {
            labelsList[i].removeAttribute("onclick");
            labelsList[i].classList.remove("deleteMode");
        }
    }
    resizeText({ elements: document.querySelectorAll('.text'), step: 0.5 })
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
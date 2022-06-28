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

function addItem() {
    var x = document.getElementById("labelText").value;
    var y = document.getElementById("labelQuantity").value;

    if (y.length == 0) {
        var y = 1;
    } else if (y > 100) {
        var y = 100;
    }

    for (let i = 0; i < y; i++) {
        var item = document.createElement("li");
        document.getElementById("labelList").appendChild(item);
        var itemText = document.createElement("span")
        item.appendChild(itemText)
        itemText.innerHTML = x;
        itemText.contentEditable = true;
        item.classList.add('text-container');

        itemText.classList.add('text');
    }
    slist(document.getElementById("labelList"));
    updateLabels();
}

function toggleMultilineImport() {
    document.getElementById('multiline-input-container').style.display = "block";;
    document.getElementById('multiline-input').value = null;
}

function multilineImport() {
    let textbox = document.getElementById('multiline-input').value;
    let multiLabels = textbox.split(/\r?\n/);

    for (let i = 0; i < multiLabels.length; i++) {
        var item = document.createElement("li");
        document.getElementById("labelList").appendChild(item);
        var itemText = document.createElement("span")
        item.appendChild(itemText)
        itemText.innerHTML = multiLabels[i];
        itemText.contentEditable = true;
        item.classList.add("text-container",);
        itemText.classList.add('text');
    }
    slist(document.getElementById("labelList"));
    updateLabels();
    document.getElementById('multiline-input-container').style.display = "none";;
}

function multilineImportCancel() {
    document.getElementById('multiline-input-container').style.display = "none";;
}

function clickPress(event) {
    if (event.keyCode == 13) {
        addItem();
        document.getElementById("labelText").value = null;
    }
}

const isOverflown = ({ clientWidth, clientHeight, scrollWidth, scrollHeight }) => (scrollWidth > clientWidth) || (scrollHeight > clientHeight)

function slist(target) {
    target.classList.add("slist");
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

function updateLabels() {
    // If label is empty, delete label
    var labelsList = document.querySelectorAll(".text");
    for (let i = 0; i < labelsList.length; i++) {
        if (labelsList[i].innerHTML.length == 0) {
            labelsList[i].parentElement.remove();
        }
    }
    // Resize label text
    resizeText({ elements: document.querySelectorAll('.text'), step: 0.5 })
}

window.onbeforeprint = (event) => {
    // Actions to be performed before printing
    // Remove the header
    var header = document.getElementById('header');
    header.style.display = "none";
    // Update labels
    updateLabels()
};

window.onafterprint = (event) => {
    // Display the header after printing has finished
    header.style.display = "flex";
};
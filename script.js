function saveData() {
    let data = {
        books: document.getElementById('bookEntries').innerHTML,
        movies: document.getElementById('movieEntries').innerHTML,
        journal: document.getElementById('journalEntries').innerHTML
    };
    localStorage.setItem('recordData', JSON.stringify(data));
}

function loadData() {
    let storedData = localStorage.getItem('recordData');
    if (storedData) {
        let data = JSON.parse(storedData);
        document.getElementById('bookEntries').innerHTML = data.books;
        document.getElementById('movieEntries').innerHTML = data.movies;
        document.getElementById('journalEntries').innerHTML = data.journal;
    }
}

function addEntry(type) {
    let title = document.getElementById(type + 'Title').value;
    let content = document.getElementById(type + 'Review' || type + 'Entry').value;
    let entry = document.createElement('div');
    entry.className = 'entry';
    entry.innerHTML = `<strong>${title}</strong><p>${content}</p><button onclick="this.parentNode.remove(); saveData();">删除</button>`;
    document.getElementById(type + 'Entries').appendChild(entry);
    saveData();
}

function exportData() {
    let data = JSON.stringify(localStorage.getItem('recordData'));
    let blob = new Blob([data], { type: "application/json" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "记录备份.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

window.onload = loadData;
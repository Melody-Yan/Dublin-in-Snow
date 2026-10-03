let currentTrackIndex = 0;
let tracks = JSON.parse(localStorage.getItem("musicLinks")) || [];
const audioPlayer = document.getElementById("audio-player");
const musicTitle = document.getElementById("music-title");
const progressBar = document.getElementById("progress-bar");

// 加载并显示音乐列表
function displayMusicLinks() {
    const musicListContainer = document.getElementById("music-list");
    musicListContainer.innerHTML = '';
    tracks.forEach((link, index) => {
        let listItem = document.createElement("li");
        listItem.textContent = link.split('/').pop(); // 只显示文件名

        let deleteButton = document.createElement("button");
        deleteButton.textContent = "删除";
        deleteButton.onclick = () => removeMusic(index);

        listItem.appendChild(deleteButton);
        musicListContainer.appendChild(listItem);
    });
}

// 添加音乐
function saveMusic() {
    const musicInput = document.getElementById("music-input").value.trim();
    if (musicInput) {
        tracks.push(musicInput);
        localStorage.setItem("musicLinks", JSON.stringify(tracks));
        displayMusicLinks();
        document.getElementById("music-input").value = '';
        if (tracks.length === 1) {
            loadTrack(0);
        }
    }
}

// 删除音乐
function removeMusic(index) {
    tracks.splice(index, 1);
    localStorage.setItem("musicLinks", JSON.stringify(tracks));
    displayMusicLinks();
    if (index === currentTrackIndex) {
        currentTrackIndex = 0;
        loadTrack(0);
    }
}

// 加载歌曲
function loadTrack(index) {
    if (tracks.length > 0) {
        currentTrackIndex = index;
        audioPlayer.src = tracks[index];
        musicTitle.textContent = tracks[index].split('/').pop();
        audioPlayer.play();
    } else {
        musicTitle.textContent = "无音乐";
        audioPlayer.src = "";
    }
}

// 播放/暂停
function togglePlayPause() {
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

// 上一首
function prevTrack() {
    if (tracks.length > 0) {
        currentTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
        loadTrack(currentTrackIndex);
    }
}

// 下一首
function nextTrack() {
    if (tracks.length > 0) {
        currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
        loadTrack(currentTrackIndex);
    }
}

// 更新进度条
function updateProgress() {
    if (audioPlayer.duration) {
        progressBar.style.width = (audioPlayer.currentTime / audioPlayer.duration) * 100 + "%";
    }
}

// 页面加载时执行
window.onload = function () {
    displayMusicLinks();
    if (tracks.length > 0) {
        loadTrack(0);
    }
};
// 导出所有笔记
function exportNotes() {
    const notes = localStorage.getItem("notes");
    if (notes) {
        const blob = new Blob([notes], { type: "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "notes.txt";
        link.click();
    } else {
        alert("没有可导出的笔记！");
    }
};

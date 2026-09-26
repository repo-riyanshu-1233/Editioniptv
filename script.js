const defaultM3uUrl = " https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8."; 

let allChannels = [];
let currentPlaybackMode = "web";

const urlParams = new URLSearchParams(window.location.search);
const activePlaylistUrl = urlParams.get('playlist') || defaultM3uUrl;

if (activePlaylistUrl !== defaultM3uUrl) {
    document.getElementById('appTitle').innerText = " Custom IPTV Stream";
    document.getElementById('playlistSource').innerText = `Source: ${activePlaylistUrl}`;
} else {
    document.getElementById('playlistSource').innerText = `Source: Default System Playlist`;
}
function togglePlaybackMode() {
    const btn = document.getElementById('modeToggleBtn');
    const statusText = document.getElementById('currentModeStatus');
    
    if (currentPlaybackMode === "web") {
        currentPlaybackMode = "external";
        btn.innerText = "📺 Play on Web Browser";
        btn.style.borderColor = "#00bcff";
        btn.style.color = "#00bcff";
        statusText.innerText = "🚀 Current Action: Clicking cards will prompt Android External Apps";
        statusText.style.color = "#00ff66";
    } else {
        currentPlaybackMode = "web";
        btn.innerText = "📱 Play on External App";
        btn.style.borderColor = "#00ff66";
        btn.style.color = "#00ff66";
        statusText.innerText = "✨ Current Action: Playing inside Web Browser Player";
        statusText.style.color = "#00bcff";
    }
}
async function loadIPTVData() {
    const statusText = document.getElementById('statusMessage');
    try {
        const response = await fetch(activePlaylistUrl);
        if (!response.ok) throw new Error("File response error");
        
        const textData = await response.text();
        parseM3U(textData);
    } catch (error) {
        statusText.innerHTML = `<span style="color: #ff4757;">⚠️ Connection Error! Please check playlist.m3u.</span>`;
        console.error("Fetch Error: ", error);
    }
}
function parseM3U(text) {
    const lines = text.split('\n');
    let currentName = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
            const parts = line.split(',');
            currentName = parts[parts.length - 1] || "Live Channel";
        } else if (line.startsWith('http')) {
            if (currentName) {
                allChannels.push({ name: currentName, url: line });
                currentName = "";
            }
        }
    }

    if (allChannels.length === 0) {
        document.getElementById('statusMessage').innerText = "No channels found in this link.";
    } else {
        document.getElementById('statusMessage').innerText = `🚀 ${allChannels.length} Channels Loaded Successfully!`;
        renderGrid(allChannels);
    }
}
function renderGrid(channelsList) {
    const grid = document.getElementById('channelGrid');
    grid.innerHTML = "";

    channelsList.forEach(channel => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        
        card.innerHTML = `
            <div class="channel-icon">📺</div>
            <div class="channel-name" title="${channel.name}">${channel.name}</div>
        `;
        card.onclick = () => {
            if (currentPlaybackMode === "web") {
                const playerUrl = `player.html?name=${encodeURIComponent(channel.name)}&stream=${encodeURIComponent(channel.url)}`;
                window.open(playerUrl, '_blank');
            } else {
                openAppModal(channel.name, channel.url);
            }
        };
        
        grid.appendChild(card);
    });
}
function searchChannels() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const filtered = allChannels.filter(channel => channel.name.toLowerCase().includes(query));
    renderGrid(filtered);
}

function addNewPlaylist() {
    const inputUrl = prompt("Enter your custom M3U/PHP Playlist URL:");
    if (inputUrl && inputUrl.trim().startsWith('http')) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('playlist', inputUrl.trim());
        window.open(currentUrl.toString(), '_blank');
    } else if (inputUrl) {
        alert("Invalid URL structure. Please insert a valid HTTP/HTTPS streaming link.");
    }
}

function openAppModal(name, url) {
    document.getElementById('modalChannelName').innerText = `${name}`;
    
    const cleanUrl = url.replace(/^https?:\/\//, '');

    document.getElementById('vlcBtn').onclick = () => {
        window.location.href = `intent://${cleanUrl}#Intent;scheme=http;package=org.videolan.vlc;end`;
    };
    
    document.getElementById('mxBtn').onclick = () => {
        window.location.href = `intent://${cleanUrl}#Intent;scheme=http;package=com.mxtech.videoplayer.ad;end`;
    };
    
    document.getElementById('ottBtn').onclick = () => {
        window.location.href = `intent://${cleanUrl}#Intent;scheme=http;package=ru.scb.ottnavigator;end`;
    };

    document.getElementById('appSelectorModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('appSelectorModal').style.display = 'none';
}
loadIPTVData();

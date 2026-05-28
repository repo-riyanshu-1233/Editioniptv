// 1. Direct local file se data load hoga (Bina CORS proxy ke)
const defaultM3uUrl = "https://allinonereborn.online/m3u/jtv9.m3u"; 

let allChannels = [];

const urlParams = new URLSearchParams(window.location.search);
const activePlaylistUrl = urlParams.get('playlist') || defaultM3uUrl;

// Dynamic UI Text Update
if (activePlaylistUrl !== defaultM3uUrl) {
    document.getElementById('appTitle').innerText = " Custom IPTV Stream";
    document.getElementById('playlistSource').innerText = `Source: ${activePlaylistUrl}`;
} else {
    document.getElementById('playlistSource').innerText = `Source: Default System Playlist`;
}

// Data Load Engine
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

// M3U Line Parser
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

// Render Dashboard Cards
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
            // Naye web tab (player.html) me stream data secure pass karna
            const playerUrl = `player.html?name=${encodeURIComponent(channel.name)}&stream=${encodeURIComponent(channel.url)}`;
            window.open(playerUrl, '_blank');
        };
        
        grid.appendChild(card);
    });
}

// Instant Filter Search
function searchChannels() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const filtered = allChannels.filter(channel => channel.name.toLowerCase().includes(query));
    renderGrid(filtered);
}

// Custom Playlist Adding Logic (Render Compatibility Updated)
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

// App Initialize
loadIPTVData();
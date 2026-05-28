// 1. Direct local file se data load hoga (Bina CORS proxy ke)
const defaultM3uUrl = "https://allinonereborn.online/m3u/jtv9.m3u"; 

let allChannels = [];
let currentPlaybackMode = "web"; // Default background track

const urlParams = new URLSearchParams(window.location.search);
const activePlaylistUrl = urlParams.get('playlist') || defaultM3uUrl;

// Dynamic UI Text Update (Aapka original structure vesa hi hai)
if (activePlaylistUrl !== defaultM3uUrl) {
    document.getElementById('appTitle').innerText = " Custom IPTV Stream";
    document.getElementById('playlistSource').innerText = `Source: ${activePlaylistUrl}`;
} else {
    document.getElementById('playlistSource').innerText = `Source: Default System Playlist`;
}

// 📱 CONTROL ENGINE: Interface ko touch kiye bina click action track badalna
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

// Render Dashboard Cards (Yahan action bypass system insert kiya hai)
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
        
        // Is click handler ke andar humne smart routing system laga diya hai
        card.onclick = () => {
            if (currentPlaybackMode === "web") {
                // Aapka purana code jo naye browser tab me video chalata tha
                const playerUrl = `player.html?name=${encodeURIComponent(channel.name)}&stream=${encodeURIComponent(channel.url)}`;
                window.open(playerUrl, '_blank');
            } else {
                // Agar user ne mode switch kiya hai to wahi interface me popup khulega
                openAppModal(channel.name, channel.url);
            }
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

// Deep Linking Mobile Handler Operations (Modal triggers)
function openAppModal(name, url) {
    document.getElementById('modalChannelName').innerText = `${name}`;
    
    // URL se http:// ya https:// hatane ke liye system rule
    const cleanUrl = url.replace(/^https?:\/\//, '');

    // Android Intent Protocols mapping for standard Android video Players
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

// App Initialize
loadIPTVData();

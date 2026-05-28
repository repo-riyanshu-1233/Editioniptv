// Default playlist initialization 
const defaultM3uUrl = "https://allinonereborn.online/m3u/jtv9.m3u"; 

let allChannels = [];
let currentPlaybackMode = "web"; // Default execution track
let activeSelectedStreamUrl = "";

const urlParams = new URLSearchParams(window.location.search);
const activePlaylistUrl = urlParams.get('playlist') || defaultM3uUrl;

// Maintaining UI state matching definitions
if (activePlaylistUrl !== defaultM3uUrl) {
    document.getElementById('appTitle').innerText = "📡 Custom IPTV Stream";
    document.getElementById('playlistSource').innerText = `Source: Custom User Playlist`;
} else {
    document.getElementById('playlistSource').innerText = `Source: AllInOne Reborn jtv9`;
}

// 🚀 CONTROL ENGINE: Interface ko touch kiye bina click action badalna
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

// Network Data Stream Fetcher
async function loadIPTVData() {
    const statusText = document.getElementById('statusMessage');
    try {
        const response = await fetch(activePlaylistUrl);
        if (!response.ok) throw new Error("Network configuration breakdown");
        
        const textData = await response.text();
        parseM3U(textData);
    } catch (error) {
        statusText.innerHTML = `<span style="color: #ff4757;">⚠️ Connection Error! Please verify source streams or check hosting limits.</span>`;
        console.error("Fetch Failure: ", error);
    }
}

// M3U Processing Logic
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
        document.getElementById('statusMessage').innerText = "Empty database stream matrix.";
    } else {
        document.getElementById('statusMessage').innerText = `🚀 ${allChannels.length} Channels Loaded Successfully!`;
        renderGrid(allChannels);
    }
}

// Render Same Interface Grid Layout
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
        
        // Dynamic Interception check upon execution handler
        card.onclick = () => {
            if (currentPlaybackMode === "web") {
                // Interface remains same, triggers normal browser player tab
                const playerUrl = `player.html?name=${encodeURIComponent(channel.name)}&stream=${encodeURIComponent(channel.url)}`;
                window.open(playerUrl, '_blank');
            } else {
                // Interface remains same, triggers the 3 Options Modal window
                openAppModal(channel.name, channel.url);
            }
        };
        
        grid.appendChild(card);
    });
}

// Pure Interface Filters (Search behaves identical)
function searchChannels() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const filtered = allChannels.filter(channel => channel.name.toLowerCase().includes(query));
    renderGrid(filtered);
}

// Add Custom Playlist Engine (Maintains native view state)
function addNewPlaylist() {
    const inputUrl = prompt("Enter your custom M3U/M3U8 Playlist URL:");
    if (inputUrl && inputUrl.trim().startsWith('http')) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('playlist', inputUrl.trim());
        window.open(currentUrl.toString(), '_blank');
    } else if (inputUrl) {
        alert("Invalid URL parameters applied.");
    }
}

// Deep Linking Mobile Handler Operations
function openAppModal(name, url) {
    activeSelectedStreamUrl = url;
    document.getElementById('modalChannelName').innerText = `${name}`;
    
    const cleanUrl = url.replace(/^https?:\/\//, '');

    // Android Intent Protocol Mapping rules
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

// Initializing Dashboard Environment
loadIPTVData();

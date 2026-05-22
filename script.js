// 1. Default Playlist URL Jo aapne diya hai
const defaultM3uUrl = "https://la.drmlive.au/tp/playlist.php";

// CORS Proxy browser security restrictions bypass karne ke liye
const corsProxy = "https://cors-anywhere.herokuapp.com/";

let allChannels = [];

// URL parameters read karne ke liye logic (New tab checking)
const urlParams = new URLSearchParams(window.location.search);
const activePlaylistUrl = urlParams.get('playlist') || defaultM3uUrl;

// UI update as per active playlist source
if (activePlaylistUrl !== defaultM3uUrl) {
    document.getElementById('appTitle').innerText = "📡 Custom IPTV Stream";
    document.getElementById('playlistSource').innerText = `Source: ${activePlaylistUrl}`;
} else {
    document.getElementById('playlistSource').innerText = `Source: Default System Playlist`;
}

// 2. Core M3U Parsing Logic
async function loadIPTVData() {
    const statusText = document.getElementById('statusMessage');
    try {
        // Fetching data via CORS proxy
        const response = await fetch(corsProxy + activePlaylistUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const textData = await response.text();
        parseM3U(textData);
    } catch (error) {
        statusText.innerHTML = `<span style="color: #ff4757;">⚠️ Connection Error! Please enable CORS extension or check link.</span>`;
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
                currentName = ""; // Resetting for next sequence
            }
        }
    }

    if (allChannels.length === 0) {
        document.getElementById('statusMessage').innerText = "No channels found in this playlist file.";
    } else {
        document.getElementById('statusMessage').innerText = `🚀 ${allChannels.length} Channels Loaded Successfully!`;
        renderGrid(allChannels);
    }
}

// 3. Grid UI Rendering
function renderGrid(channelsList) {
    const grid = document.getElementById('channelGrid');
    grid.innerHTML = "";

    channelsList.forEach(channel => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        
        // Auto generating mobile streaming intents for VLC Player
        const vlcIntent = `intent://${channel.url.replace(/^https?:\/\//, '')}#Intent;scheme=http;package=org.videolan.vlc;end`;
        
        card.innerHTML = `
            <div class="channel-icon">📺</div>
            <div class="channel-name" title="${channel.name}">${channel.name}</div>
        `;
        
        card.onclick = () => {
            // Instantly opens stream path inside system's default VLC application
            window.location.href = vlcIntent;
        };
        
        grid.appendChild(card);
    });
}

// 4. Instant Filter Logic
function searchChannels() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const filtered = allChannels.filter(channel => channel.name.toLowerCase().includes(query));
    renderGrid(filtered);
}

// 5. New Playlist Addition Engine (Opens clone copy in a new tab)
function addNewPlaylist() {
    const inputUrl = prompt("Enter your custom M3U/PHP Playlist URL:");
    if (inputUrl && inputUrl.trim().startsWith('http')) {
        // Current website path ko detect karke naye tab mein URL param ke sath bhejta hai
        const secureTargetUrl = `${window.location.origin}${window.location.pathname}?playlist=${encodeURIComponent(inputUrl.trim())}`;
        window.open(secureTargetUrl, '_blank');
    } else if (inputUrl) {
        alert("Invalid URL structure. Please insert a valid HTTP/HTTPS streaming link.");
    }
}

// Initialize Web App Engine
loadIPTVData();

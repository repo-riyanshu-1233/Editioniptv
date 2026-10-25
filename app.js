'use strict';

(() => {
  const DEFAULT_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.m3u';
  const PAGE_SIZE = 180;
  const $ = (selector) => document.querySelector(selector);
  const els = {
    playlistUrlForm: $('#playlistUrlForm'), playlistUrl: $('#playlistUrl'), playlistFile: $('#playlistFile'),
    resetAppBtn: $('#resetAppBtn'), addPlaylistToggle: $('#addPlaylistToggle'), addPlaylistPanel: $('#addPlaylistPanel'),
    playlistSelect: $('#playlistSelect'), playlistMessage: $('#playlistMessage'),
    channelSearch: $('#channelSearch'), groupFilter: $('#groupFilter'), favoritesOnly: $('#favoritesOnly'),
    channelCountBadge: $('#channelCountBadge'), visibleCount: $('#visibleCount'), channelList: $('#channelList'),
    video: $('#video'), emptyState: $('#emptyState'), loadingOverlay: $('#loadingOverlay'), loadingText: $('#loadingText'),
    currentTitle: $('#currentTitle'), currentSubtitle: $('#currentSubtitle'), playerMode: $('#playerMode'),
    streamTypeBadge: $('#streamTypeBadge'), playbackMessage: $('#playbackMessage'), playbackMessageText: $('#playbackMessageText'),
    engineValue: $('#engineValue'), engineDescription: $('#engineDescription'), streamStatusValue: $('#streamStatusValue'),
    streamStatusDescription: $('#streamStatusDescription'), previousBtn: $('#previousBtn'), nextBtn: $('#nextBtn'),
    retryBtn: $('#retryBtn'), fullscreenBtn: $('#fullscreenBtn'), videoFrame: $('#videoFrame')
  };

  const state = {
    playlists: [], activePlaylistId: '', channels: [], currentIndex: -1, hls: null, dash: null,
    selectedGroup: 'all', currentEngine: 'Not selected', retries: 0, favorites: loadFavorites(),
    playRequestId: 0, filteredEntries: [], renderedCount: 0, playlistRequestId: 0
  };
  const libraryLoads = new Map();

  function loadLibraryScript(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (libraryLoads.has(url)) return libraryLoads.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url; script.async = true;
      script.onload = () => {
        if (window[globalName]) resolve(window[globalName]);
        else { libraryLoads.delete(url); reject(new Error(`${globalName} loaded, but its API was not found.`)); }
      };
      script.onerror = () => { libraryLoads.delete(url); reject(new Error(`Could not load ${globalName}. Check your internet connection or the library CDN.`)); };
      document.head.append(script);
    });
    libraryLoads.set(url, promise);
    return promise;
  }

  function ensureHlsLibrary() { return loadLibraryScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js', 'Hls'); }
  function ensureDashLibrary() { return loadLibraryScript('https://cdn.dashjs.org/v4.7.4/dash.all.min.js', 'dashjs'); }

  function loadFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem('streamdeck-favorites') || '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
    } catch (_) { return new Set(); }
  }
  function saveFavorites() {
    try { localStorage.setItem('streamdeck-favorites', JSON.stringify([...state.favorites])); } catch (_) { /* Storage may be unavailable. */ }
  }
  function channelKey(channel) {
    const input = `${channel.name || ''}|${channel.url || ''}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
  }
  function setPlaylistMessage(message, kind = 'info') { els.playlistMessage.textContent = message; els.playlistMessage.dataset.kind = kind; }
  function setPlaybackMessage(message, kind = 'info') { els.playbackMessageText.textContent = message; els.playbackMessage.dataset.kind = kind; }
  function setMode(mode, stateName = 'ready') { els.playerMode.textContent = mode.toUpperCase(); els.playerMode.dataset.state = stateName; }
  function setLoading(isLoading, message = 'Connecting to stream…') {
    els.loadingOverlay.hidden = !isLoading; els.loadingText.textContent = message;
    if (isLoading) setMode('Connecting', 'loading');
  }
  function safeHttpUrl(value) {
    try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch (_) { return false; }
  }
  function safeLogoUrl(value) { return safeHttpUrl(value) ? value : ''; }
  function parseAttributes(extinfHead) {
    const attributes = {};
    const regex = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    let match;
    while ((match = regex.exec(extinfHead)) !== null) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    return attributes;
  }
  function makeAbsoluteStreamUrl(rawUrl, baseUrl) {
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';
    try { return baseUrl ? new URL(trimmed, baseUrl).href : new URL(trimmed).href; } catch (_) { return trimmed; }
  }
  function parseM3U(text, baseUrl = '') {
    const cleanText = String(text || '').replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length || !lines.some((line) => /^#EXTM3U(?:\s|$)/i.test(line))) {
      throw new Error('This does not look like an M3U playlist: the #EXTM3U header was not found. A portal homepage is not necessarily a playlist URL.');
    }
    const channels = [];
    let pending = null; let pendingGroup = '';
    for (const line of lines) {
      if (/^#EXTINF:/i.test(line)) {
        const commaAt = line.indexOf(',');
        const head = commaAt >= 0 ? line.slice(8, commaAt) : line.slice(8);
        const rawName = commaAt >= 0 ? line.slice(commaAt + 1).trim() : '';
        const attrs = parseAttributes(head);
        pending = { name: rawName || attrs['tvg-name'] || attrs['tvg-id'] || 'Unnamed channel', logo: attrs['tvg-logo'] || attrs.logo || '', group: attrs['group-title'] || pendingGroup || 'Uncategorized', tvgId: attrs['tvg-id'] || '', attrs };
        pendingGroup = ''; continue;
      }
      if (/^#EXTGRP:/i.test(line)) {
        pendingGroup = line.slice(line.indexOf(':') + 1).trim();
        if (pending && pendingGroup) pending.group = pendingGroup;
        continue;
      }
      if (line.startsWith('#')) continue;
      const url = makeAbsoluteStreamUrl(line, baseUrl);
      const channel = pending || { name: '', logo: '', group: pendingGroup || 'Uncategorized', tvgId: '', attrs: {} };
      if (!channel.name) {
        try { const parsed = new URL(url); channel.name = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname; }
        catch (_) { channel.name = url || 'Unknown channel'; }
      }
      channels.push({ ...channel, url, id: `${channels.length}-${channel.tvgId || channel.name}-${url}`, usable: /^(https?:|rtsp:|rtmp:)/i.test(url) });
      pending = null; pendingGroup = '';
    }
    if (!channels.length) throw new Error('Playlist header found, but no channel URLs were found.');
    return channels;
  }
  function stopPlayback() {
    if (state.hls) { try { state.hls.destroy(); } catch (_) {} state.hls = null; }
    if (state.dash) { try { state.dash.reset(); } catch (_) {} state.dash = null; }
    els.video.pause(); els.video.onerror = null; els.video.onplaying = null; els.video.onwaiting = null; els.video.oncanplay = null; els.video.onloadedmetadata = null;
    els.video.removeAttribute('src'); els.video.load(); setLoading(false);
  }
  function emptyChannelsMessage(title, description) {
    const wrapper = document.createElement('div'); wrapper.className = 'empty-library';
    const icon = document.createElement('span'); icon.className = 'empty-library-icon'; icon.textContent = '⌕';
    const heading = document.createElement('strong'); heading.textContent = title;
    const note = document.createElement('p'); note.textContent = description;
    wrapper.append(icon, heading, note); return wrapper;
  }
  function getFilteredChannels() {
    const query = els.channelSearch.value.trim().toLocaleLowerCase();
    return state.channels.map((channel, index) => ({ channel, index })).filter(({ channel }) => {
      const matchesSearch = !query || `${channel.name} ${channel.group} ${channel.tvgId}`.toLocaleLowerCase().includes(query);
      const matchesGroup = state.selectedGroup === 'all' || channel.group === state.selectedGroup;
      const matchesFavorites = !els.favoritesOnly.checked || state.favorites.has(channelKey(channel));
      return matchesSearch && matchesGroup && matchesFavorites;
    });
  }
  function renderGroups() {
    const previous = state.selectedGroup;
    const groups = [...new Set(state.channels.map((channel) => channel.group || 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
    els.groupFilter.replaceChildren();
    const allOption = document.createElement('option'); allOption.value = 'all'; allOption.textContent = 'All categories'; els.groupFilter.append(allOption);
    for (const group of groups) { const option = document.createElement('option'); option.value = group; option.textContent = group; els.groupFilter.append(option); }
    state.selectedGroup = groups.includes(previous) ? previous : 'all'; els.groupFilter.value = state.selectedGroup;
  }
  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase() || '?'; }
  function createChannelRow(channel, index) {
    const row = document.createElement('div'); row.className = `channel-row${index === state.currentIndex ? ' active' : ''}`; row.setAttribute('role', 'listitem');
    const iconWrap = document.createElement('div'); const logoUrl = safeLogoUrl(channel.logo);
    if (logoUrl) {
      const image = document.createElement('img'); image.className = 'channel-logo'; image.src = logoUrl; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.onerror = () => { const fallback = document.createElement('span'); fallback.className = 'channel-logo-fallback'; fallback.textContent = initials(channel.name); image.replaceWith(fallback); };
      iconWrap.append(image);
    } else { const fallback = document.createElement('span'); fallback.className = 'channel-logo-fallback'; fallback.textContent = initials(channel.name); iconWrap.append(fallback); }
    const meta = document.createElement('span'); meta.className = 'channel-meta';
    const name = document.createElement('span'); name.className = 'channel-name'; name.textContent = channel.name;
    const group = document.createElement('span'); group.className = 'channel-group'; group.textContent = index === state.currentIndex ? 'NOW PLAYING' : (channel.group || 'Uncategorized'); meta.append(name, group);
    const favorite = document.createElement('button'); const isFavorite = state.favorites.has(channelKey(channel));
    favorite.type = 'button'; favorite.className = `favorite-button${isFavorite ? ' is-favorite' : ''}`; favorite.textContent = isFavorite ? '★' : '☆';
    favorite.title = isFavorite ? 'Remove from favorites' : 'Add to favorites'; favorite.setAttribute('aria-label', favorite.title);
    favorite.addEventListener('click', (event) => { event.stopPropagation(); const key = channelKey(channel); if (state.favorites.has(key)) state.favorites.delete(key); else state.favorites.add(key); saveFavorites(); renderChannels(); });
    row.append(iconWrap, meta, favorite); row.tabIndex = 0; row.addEventListener('click', () => playChannel(index));
    row.addEventListener('keydown', (event) => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); playChannel(index); } });
    return row;
  }
  function appendNextChannelBatch() {
    const end = Math.min(state.renderedCount + PAGE_SIZE, state.filteredEntries.length);
    const fragment = document.createDocumentFragment();
    for (let i = state.renderedCount; i < end; i += 1) {
      const entry = state.filteredEntries[i]; fragment.append(createChannelRow(entry.channel, entry.index));
    }
    els.channelList.append(fragment); state.renderedCount = end;
  }
  function renderChannels() {
    state.filteredEntries = getFilteredChannels(); state.renderedCount = 0; els.channelList.scrollTop = 0; els.channelList.replaceChildren();
    els.channelCountBadge.textContent = String(state.channels.length);
    els.visibleCount.textContent = `${state.filteredEntries.length.toLocaleString()} found`;
    if (!state.channels.length) { els.channelList.append(emptyChannelsMessage('No channels loaded', 'The selected playlist may have failed to load.')); return; }
    if (!state.filteredEntries.length) { els.channelList.append(emptyChannelsMessage('No matching channels', 'Try another search, category or favorites filter.')); return; }
    appendNextChannelBatch();
  }
  function renderPlaylistOptions() {
    const current = state.activePlaylistId;
    els.playlistSelect.replaceChildren();
    if (!state.playlists.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No playlist loaded'; els.playlistSelect.append(option); return; }
    for (const playlist of state.playlists) {
      const option = document.createElement('option'); option.value = playlist.id;
      option.textContent = `${playlist.name} (${playlist.channels.length.toLocaleString()})`; els.playlistSelect.append(option);
    }
    els.playlistSelect.value = current;
  }
  function activatePlaylist(playlist, note = '') {
    state.playRequestId += 1; stopPlayback(); state.activePlaylistId = playlist.id; state.channels = playlist.channels;
    state.currentIndex = -1; state.selectedGroup = 'all'; els.channelSearch.value = ''; els.favoritesOnly.checked = false;
    renderPlaylistOptions(); renderGroups(); renderChannels();
    els.currentTitle.textContent = 'Choose a channel';
    els.currentSubtitle.textContent = `${playlist.name} · ${playlist.channels.length.toLocaleString()} channels loaded`;
    els.emptyState.hidden = false; els.emptyState.querySelector('h3').textContent = 'Your screen is ready';
    els.emptyState.querySelector('p').textContent = 'Choose a channel from the playlist to start watching.';
    els.streamTypeBadge.textContent = 'No stream'; els.engineValue.textContent = 'Not selected';
    els.engineDescription.textContent = 'HLS.js, DASH.js or the browser native media player.';
    els.streamStatusValue.textContent = 'Playlist ready'; els.streamStatusDescription.textContent = 'Select a channel to start playback.';
    setMode('Ready'); setPlaybackMessage(note || 'Playlist loaded. Select a channel to attempt browser playback.', 'success');
  }
  function addPlaylistToLibrary(name, channels, sourceKey, note = '') {
    const existing = sourceKey ? state.playlists.find((playlist) => playlist.sourceKey === sourceKey) : null;
    if (existing) {
      existing.channels = channels; existing.name = name;
      activatePlaylist(existing, `${channels.length.toLocaleString()} channels refreshed from ${name}.`);
      setPlaylistMessage(`Updated ${name} (${channels.length.toLocaleString()} channels).`, 'success');
      return existing;
    }
    const playlist = { id: `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, channels, sourceKey: sourceKey || '' };
    state.playlists.push(playlist); activatePlaylist(playlist, note);
    setPlaylistMessage(`Added ${name}: ${channels.length.toLocaleString()} channels.`, 'success');
    return playlist;
  }
  async function importPlaylistFromUrl(rawUrl, options = {}) {
    let url;
    try { url = new URL(rawUrl.trim()); } catch (_) { throw new Error('Please enter a valid playlist URL.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Playlist URL must use HTTP or HTTPS.');
    const requestId = ++state.playlistRequestId;
    setPlaylistMessage(`Fetching playlist from ${url.hostname}… This may take a little while for a large playlist.`, 'info');
    try {
      const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 90000);
      let response; let text;
      try {
        response = await fetch(url.href, { method: 'GET', mode: 'cors', redirect: 'follow', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`Playlist server returned HTTP ${response.status}.`);
        text = await response.text();
      } finally { window.clearTimeout(timeout); }
      if (requestId !== state.playlistRequestId) return;
      const channels = parseM3U(text, response.url || url.href);
      const sourceKey = url.href.replace(/#.*$/, '');
      const name = options.isDefault ? 'IPTV-org default' : (url.hostname + (url.pathname !== '/' ? url.pathname : ''));
      addPlaylistToLibrary(name, channels, sourceKey, `Loaded ${channels.length.toLocaleString()} entries. Playback depends on each stream's format and server configuration.`);
      if (options.isDefault) setPlaylistMessage(`Default playlist loaded: ${channels.length.toLocaleString()} entries. Choose a channel to test playback.`, 'success');
      els.addPlaylistPanel.hidden = true; els.addPlaylistToggle.setAttribute('aria-expanded', 'false');
    } catch (error) {
      if (requestId !== state.playlistRequestId) return;
      const message = String(error && error.message || error);
      const corsLikely = error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message);
      if (error && error.name === 'AbortError') throw new Error('Playlist fetch timed out. The playlist may be large or the server may be slow. Try again later or download the playlist and upload the file.');
      if (corsLikely) throw new Error('The browser could not fetch this playlist. The server may block cross-origin requests (CORS), require authentication, or be offline. Try uploading a downloaded playlist file, or use a source that allows your website.');
      throw error;
    }
  }
  async function importPlaylistFile(file) {
    if (!file) return;
    setPlaylistMessage(`Reading ${file.name}…`, 'info');
    const text = await file.text(); const channels = parseM3U(text, '');
    const relativeUrls = channels.filter((channel) => !/^(https?:|rtsp:|rtmp:)/i.test(channel.url)).length;
    const note = relativeUrls ? `Loaded ${channels.length.toLocaleString()} entries. ${relativeUrls} relative stream URL(s) may not work from a local playlist file.` : `Loaded ${channels.length.toLocaleString()} entries from ${file.name}. Choose a channel to test playback.`;
    addPlaylistToLibrary(file.name, channels, '', note);
    setPlaylistMessage(`Added ${file.name}: ${channels.length.toLocaleString()} channels.`, relativeUrls ? 'warning' : 'success');
    els.addPlaylistPanel.hidden = true; els.addPlaylistToggle.setAttribute('aria-expanded', 'false');
  }
  function setEngine(engine, description) {
    state.currentEngine = engine; els.engineValue.textContent = engine; els.engineDescription.textContent = description;
    els.streamStatusValue.textContent = 'Connecting'; els.streamStatusDescription.textContent = 'Waiting for media data from the stream.';
  }
  function channelType(url) {
    const lower = String(url).toLowerCase();
    if (/\.m3u8(?:$|[?#])|format=m3u8/.test(lower)) return 'HLS';
    if (/\.mpd(?:$|[?#])/.test(lower)) return 'DASH';
    if (/^rtsp:/i.test(lower)) return 'RTSP'; if (/^rtmp:/i.test(lower)) return 'RTMP';
    if (/\.(mp4|m4v|webm|ogv|mp3|m4a|aac|ogg|wav)(?:$|[?#])/.test(lower)) return 'Direct media';
    return 'Auto / direct media';
  }
  function showUnsupported(protocol) {
    stopPlayback(); els.emptyState.hidden = false;
    els.emptyState.querySelector('h3').textContent = `${protocol} is not supported directly by browsers`;
    els.emptyState.querySelector('p').textContent = 'For a stream you own or are authorized to redistribute, use a properly configured compatible media gateway. This player does not bypass access controls or DRM.';
    setMode('Unsupported', 'error'); els.streamStatusValue.textContent = 'Unsupported protocol';
    els.streamStatusDescription.textContent = `${protocol} needs a compatible server-side gateway or native app.`;
    setPlaybackMessage(`${protocol} cannot be played directly by the standard browser video element.`, 'warning'); els.streamTypeBadge.textContent = protocol;
  }
  async function playChannel(index) {
    const channel = state.channels[index]; if (!channel) return;
    const requestId = ++state.playRequestId; state.currentIndex = index; state.retries = 0; renderChannels(); stopPlayback();
    els.emptyState.hidden = false; els.emptyState.querySelector('h3').textContent = 'Connecting to stream'; els.emptyState.querySelector('p').textContent = channel.name;
    els.currentTitle.textContent = channel.name; els.currentSubtitle.textContent = `${channel.group || 'Uncategorized'}${channel.tvgId ? ` · ${channel.tvgId}` : ''}`;
    els.streamTypeBadge.textContent = channelType(channel.url); setLoading(true, 'Connecting to stream…');
    setPlaybackMessage('Connecting. A channel may fail because of expired URLs, unsupported formats, CORS or source-server rules.');
    let parsedUrl;
    try { parsedUrl = new URL(channel.url); } catch (_) {
      setLoading(false); setMode('Invalid URL', 'error'); els.emptyState.querySelector('h3').textContent = 'Invalid stream URL';
      els.emptyState.querySelector('p').textContent = 'This entry does not contain a complete stream URL.';
      setPlaybackMessage('The channel URL is relative or malformed. Load the playlist from its original host or correct the URL.', 'error');
      els.streamStatusValue.textContent = 'Invalid URL'; els.streamStatusDescription.textContent = 'A complete stream URL is required.'; return;
    }
    if (parsedUrl.protocol === 'rtsp:' || parsedUrl.protocol === 'rtmp:') { showUnsupported(parsedUrl.protocol.slice(0, -1).toUpperCase()); return; }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      setLoading(false); setMode('Unsupported', 'error'); setPlaybackMessage(`The ${parsedUrl.protocol} protocol is not supported by this web player.`, 'warning');
      els.streamStatusValue.textContent = 'Unsupported protocol'; els.streamStatusDescription.textContent = 'Only HTTP(S) browser media, HLS and DASH are handled here.'; return;
    }
    const type = channelType(channel.url); const isNativeHls = type === 'HLS' && Boolean(els.video.canPlayType('application/vnd.apple.mpegurl'));
    try {
      if (type === 'HLS' && isNativeHls) {
        setEngine('Native HLS', 'HLS support built into this browser (commonly Safari).'); els.video.removeAttribute('crossorigin'); els.video.src = channel.url; attachVideoEvents(channel); await requestPlay();
      } else if (type === 'HLS') {
        const HlsLibrary = await ensureHlsLibrary(); if (requestId !== state.playRequestId) return;
        if (!HlsLibrary.isSupported()) throw new Error('This browser does not expose Media Source Extensions needed by HLS.js. Try a browser with native HLS support.');
        setEngine('HLS.js', 'HLS manifest and segments are requested by the browser; source CORS rules still apply.'); els.video.crossOrigin = 'anonymous';
        state.hls = new HlsLibrary({ enableWorker: true, backBufferLength: 90, maxBufferLength: 30 }); attachVideoEvents(channel);
        state.hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (!data || !data.fatal) return;
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && state.retries < 1) { state.retries += 1; setPlaybackMessage('Temporary HLS network error. Trying one recovery attempt…', 'warning'); window.setTimeout(() => { if (state.hls) state.hls.startLoad(); }, 900); }
          else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && state.retries < 2) { state.retries += 1; setPlaybackMessage('HLS media error. Attempting media recovery…', 'warning'); state.hls.recoverMediaError(); }
          else { setLoading(false); setMode('Playback error', 'error'); els.streamStatusValue.textContent = 'Playback failed'; els.streamStatusDescription.textContent = `HLS reported a fatal ${data.type || 'stream'} error.`; setPlaybackMessage('The HLS stream failed. Check URL validity, CORS permissions, expiry and access authorization.', 'error'); }
        });
        state.hls.loadSource(channel.url); state.hls.attachMedia(els.video);
      } else if (type === 'DASH') {
        const DashLibrary = await ensureDashLibrary(); if (requestId !== state.playRequestId) return;
        if (typeof DashLibrary.MediaPlayer !== 'function') throw new Error('DASH.js loaded but does not expose the expected MediaPlayer API.');
        setEngine('DASH.js', 'MPEG-DASH playback through the DASH.js browser player.'); state.dash = DashLibrary.MediaPlayer().create(); attachVideoEvents(channel);
        state.dash.on(window.dashjs.MediaPlayer.events.ERROR, (event) => { if (event && event.error) { setLoading(false); setMode('Playback error', 'error'); els.streamStatusValue.textContent = 'Playback failed'; els.streamStatusDescription.textContent = 'DASH.js reported a stream error.'; setPlaybackMessage('DASH playback failed. Verify the MPD, codecs, CORS rules and stream authorization.', 'error'); } });
        state.dash.initialize(els.video, channel.url, true);
      } else {
        setEngine('HTML5 media', 'Direct browser media playback; codecs and containers depend on the browser and device.'); els.video.removeAttribute('crossorigin'); els.video.src = channel.url; attachVideoEvents(channel); await requestPlay();
      }
    } catch (error) {
      if (requestId !== state.playRequestId) return;
      setLoading(false); setMode('Playback error', 'error'); els.streamStatusValue.textContent = 'Playback failed'; els.streamStatusDescription.textContent = 'Player initialization failed.';
      setPlaybackMessage(error && error.message ? error.message : 'Could not initialize playback.', 'error'); els.emptyState.hidden = false;
      els.emptyState.querySelector('h3').textContent = 'Could not start this stream'; els.emptyState.querySelector('p').textContent = 'Use Retry or check the stream URL and browser compatibility.';
    }
  }
  function attachVideoEvents(channel) {
    els.video.onplaying = () => { setLoading(false); setMode('Playing'); els.emptyState.hidden = true; els.streamStatusValue.textContent = 'Playing'; els.streamStatusDescription.textContent = 'The browser has started receiving playable media.'; setPlaybackMessage(`Playing “${channel.name}”.`, 'success'); };
    els.video.onwaiting = () => { setLoading(true, 'Buffering…'); els.streamStatusValue.textContent = 'Buffering'; els.streamStatusDescription.textContent = 'Waiting for media data.'; };
    els.video.oncanplay = () => { setLoading(false); if (!els.video.paused) setMode('Playing'); else setMode('Ready'); };
    els.video.onloadedmetadata = () => { setLoading(false); els.streamStatusValue.textContent = 'Media detected'; els.streamStatusDescription.textContent = 'Metadata loaded; waiting for playback.'; };
    els.video.onerror = () => {
      setLoading(false); setMode('Playback error', 'error'); const code = els.video.error ? els.video.error.code : 0;
      const detail = ({ 1: 'Playback was aborted.', 2: 'A network error occurred.', 3: 'The browser could not decode this media.', 4: 'The media URL or format is not supported.' })[code] || 'The browser could not play this stream.';
      els.streamStatusValue.textContent = 'Playback failed'; els.streamStatusDescription.textContent = detail;
      setPlaybackMessage(`${detail} Also check expiry, CORS, codecs and access permissions. The browser does not expose every HTTP error to the page.`, 'error');
      els.emptyState.hidden = false; els.emptyState.querySelector('h3').textContent = 'Stream could not be played'; els.emptyState.querySelector('p').textContent = detail;
    };
  }
  async function requestPlay() {
    try { const promise = els.video.play(); if (promise && typeof promise.then === 'function') await promise; }
    catch (error) {
      if (error && error.name === 'NotAllowedError') { setLoading(false); setMode('Ready'); setPlaybackMessage('The browser blocked automatic playback. Press Play on the video controls.', 'warning'); }
      else throw error;
    }
  }
  function retryCurrent() { if (state.currentIndex >= 0) playChannel(state.currentIndex); else setPlaybackMessage('Choose a channel before retrying playback.'); }
  function changeChannel(direction) {
    if (!state.channels.length) return; let next = state.currentIndex;
    if (next < 0) next = direction > 0 ? 0 : state.channels.length - 1;
    else next = (next + direction + state.channels.length) % state.channels.length;
    playChannel(next);
  }
  async function resetWebsite() {
    const accepted = window.confirm('Reset the player, clear all added playlists and favorites, and reload the default IPTV-org playlist? This will not remove server-side restrictions.');
    if (!accepted) return;
    state.playRequestId += 1; state.playlistRequestId += 1; stopPlayback(); state.playlists = []; state.activePlaylistId = ''; state.channels = [];
    state.currentIndex = -1; state.selectedGroup = 'all'; state.filteredEntries = []; state.renderedCount = 0; state.favorites.clear();
    try { localStorage.removeItem('streamdeck-favorites'); } catch (_) {}
    els.playlistUrl.value = ''; els.channelSearch.value = ''; els.favoritesOnly.checked = false; els.groupFilter.replaceChildren();
    const all = document.createElement('option'); all.value = 'all'; all.textContent = 'All categories'; els.groupFilter.append(all);
    els.currentTitle.textContent = 'Choose a channel'; els.currentSubtitle.textContent = 'Reloading the default playlist.';
    els.emptyState.hidden = false; els.emptyState.querySelector('h3').textContent = 'Resetting player'; els.emptyState.querySelector('p').textContent = 'Loading the default playlist again…';
    els.engineValue.textContent = 'Not selected'; els.engineDescription.textContent = 'HLS.js, DASH.js or the browser native media player.';
    els.streamStatusValue.textContent = 'Resetting'; els.streamStatusDescription.textContent = 'Clearing local session state.'; els.streamTypeBadge.textContent = 'No stream';
    renderPlaylistOptions(); renderChannels(); setMode('Resetting', 'loading'); setPlaylistMessage('Reset complete. Reloading the default playlist…');
    els.addPlaylistPanel.hidden = true; els.addPlaylistToggle.setAttribute('aria-expanded', 'false');
    try { await importPlaylistFromUrl(DEFAULT_PLAYLIST_URL, { isDefault: true }); }
    catch (error) { setPlaylistMessage(error && error.message ? error.message : 'Could not reload the default playlist.', 'error'); els.currentSubtitle.textContent = 'Default playlist could not be fetched. Check your connection and retry.'; setMode('Playlist error', 'error'); }
  }

  els.playlistUrlForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const url = els.playlistUrl.value.trim(); if (!url) { setPlaylistMessage('Enter a playlist URL first.', 'warning'); return; }
    try { await importPlaylistFromUrl(url); els.playlistUrl.value = ''; }
    catch (error) { setPlaylistMessage(error && error.message ? error.message : 'Playlist could not be loaded.', 'error'); }
  });
  els.playlistFile.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    try { await importPlaylistFile(file); }
    catch (error) { setPlaylistMessage(error && error.message ? error.message : 'Playlist file could not be read.', 'error'); }
    finally { event.target.value = ''; }
  });
  els.playlistSelect.addEventListener('change', () => {
    const playlist = state.playlists.find((item) => item.id === els.playlistSelect.value); if (playlist) activatePlaylist(playlist, `Switched to ${playlist.name}.`);
  });
  els.addPlaylistToggle.addEventListener('click', () => {
    const willOpen = els.addPlaylistPanel.hidden; els.addPlaylistPanel.hidden = !willOpen; els.addPlaylistToggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) els.playlistUrl.focus();
  });
  els.resetAppBtn.addEventListener('click', resetWebsite);
  els.channelSearch.addEventListener('input', renderChannels);
  els.groupFilter.addEventListener('change', () => { state.selectedGroup = els.groupFilter.value; renderChannels(); });
  els.favoritesOnly.addEventListener('change', renderChannels);
  els.channelList.addEventListener('scroll', () => {
    if (state.renderedCount >= state.filteredEntries.length) return;
    if (els.channelList.scrollTop + els.channelList.clientHeight >= els.channelList.scrollHeight - 100) appendNextChannelBatch();
  });
  els.previousBtn.addEventListener('click', () => changeChannel(-1)); els.nextBtn.addEventListener('click', () => changeChannel(1)); els.retryBtn.addEventListener('click', retryCurrent);
  els.fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (els.videoFrame.requestFullscreen) await els.videoFrame.requestFullscreen();
      else if (els.video.webkitEnterFullscreen) els.video.webkitEnterFullscreen();
      else setPlaybackMessage('Fullscreen is not supported by this browser.', 'warning');
    } catch (_) { setPlaybackMessage('The browser could not enter fullscreen. Try the video player’s own fullscreen control.', 'warning'); }
  });
  window.addEventListener('beforeunload', stopPlayback);

  renderChannels();
  // Auto-load the requested default playlist. This fetch needs the source server to permit browser CORS access.
  importPlaylistFromUrl(DEFAULT_PLAYLIST_URL, { isDefault: true }).catch((error) => {
    renderPlaylistOptions();
    setPlaylistMessage(error && error.message ? error.message : 'Could not load the default playlist.', 'error');
    els.currentSubtitle.textContent = 'Default playlist could not be fetched. You can retry or add another playlist.';
    els.emptyState.querySelector('h3').textContent = 'Playlist could not load';
    els.emptyState.querySelector('p').textContent = 'Check your internet connection or add a different M3U/M3U8 playlist.';
    setMode('Playlist error', 'error');
  });
})();

// Ceylon 1802 — Client Application
(function() {
  'use strict';

  // ---- State ----
  let accountId = null;
  let characterId = null;
  let email = null;
  let isAdmin = false;
  let ws = null;
  let reconnectAttempts = 0;
  let commandHistory = [];
  let historyIndex = -1;
  let currentRoomData = null;
  let mapRegionId = null;
  let mapVisited = new Set();
  let mapEdges = [];

  // Default hotkeys (customizable later)
  let hotkeys = [
    { label: 'Attack', cmd: 'attack' },
    { label: 'Forage', cmd: 'forage' },
    { label: 'Fish', cmd: 'fish' },
    { label: 'Get All', cmd: 'get all' },
    { label: 'Say', cmd: null },
  ];

  // ---- DOM Refs ----
  const $ = (id) => document.getElementById(id);

  const screenAuth = $('screen-auth');
  const screenChar = $('screen-character');
  const screenGame = $('screen-game');

  const AUTH_STORAGE_KEY = 'ceylon_auth';

  function setAuthStorage(accountId, email, characterId) {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accountId, email, characterId }));
    } catch (e) { /* ignore quota / private */ }
  }

  function clearAuthStorage() {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {}
  }

  function getAuthStorage() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const loginPanel = $('auth-login');

  const gameLog = $('game-log');
  const cmdInput = $('cmd-input');
  const roomTitle = $('room-title');
  const exitsBar = $('exits-bar');
  const entitiesPanel = $('entities-panel');
  const entitiesList = $('entities-list');
  const combatRow = $('combat-row');
  const hotkeyBar = $('hotkey-bar');

  // ---- Screen Management ----
  function showScreen(screen) {
    screenAuth.classList.remove('active');
    screenChar.classList.remove('active');
    screenGame.classList.remove('active');
    screen.classList.add('active');
  }

  // ---- Auth ----
  $('btn-login').addEventListener('click', async () => {
    const emailVal = $('login-email').value.trim();
    const pass = $('login-password').value;
    if (!emailVal || !pass) { $('login-error').textContent = 'Enter email and password'; return; }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { $('login-error').textContent = data.error; return; }

      accountId = data.accountId;
      email = data.email;
      isAdmin = data.isAdmin;
      showCharacterSelect(data.characters);
    } catch (e) {
      $('login-error').textContent = 'Connection error';
    }
  });

  $('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-login').click(); });
  $('login-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-password').focus(); });

  function doLogout() {
    clearAuthStorage();
    accountId = null;
    characterId = null;
    email = null;
    isAdmin = false;
    if (ws) ws.close();
    ws = null;
    showScreen(screenAuth);
  }

  $('btn-logout').addEventListener('click', doLogout);

  // ---- Character Select ----
  function showCharacterSelect(characters) {
    showScreen(screenChar);
    const list = $('character-list');
    const createForm = $('character-create');
    const createLink = $('character-create-link');
    list.innerHTML = '';

    if (characters.length === 0) {
      createForm.style.display = '';
      createLink.style.display = 'none';
    } else {
      createForm.style.display = 'none';
      createLink.style.display = '';

      for (const char of characters) {
        const card = document.createElement('div');
        card.className = 'char-card';
        card.innerHTML = `
          <div>
            <div class="char-card-name">${escapeHtml(char.name)}</div>
            <div class="char-card-info">Level ${char.level} ${char.background}</div>
          </div>
          <div style="color:var(--accent);">Play &rarr;</div>
        `;
        card.addEventListener('click', () => enterGame(char.id));
        list.appendChild(card);
      }
    }
  }

  $('btn-show-create').addEventListener('click', () => {
    $('character-create').style.display = '';
    $('character-create-link').style.display = 'none';
  });

  $('btn-create-char').addEventListener('click', async () => {
    const name = $('char-name').value.trim();
    const bg = $('char-background').value;
    if (!name) { $('char-error').textContent = 'Enter a name'; return; }

    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, name, background: bg }),
      });
      const data = await res.json();
      if (!res.ok) { $('char-error').textContent = data.error; return; }

      enterGame(data.characterId);
    } catch (e) {
      $('char-error').textContent = 'Connection error';
    }
  });

  // ---- WebSocket / Game Entry ----
  function enterGame(charId) {
    characterId = charId;
    setAuthStorage(accountId, email, characterId);
    showScreen(screenGame);
    gameLog.innerHTML = '';
    connectWebSocket();
  }

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.addEventListener('open', () => {
      reconnectAttempts = 0;
      ws.send(JSON.stringify({ type: 'auth', accountId, characterId }));
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    });

    ws.addEventListener('close', () => {
      appendLog('system', '*Connection lost. Reconnecting...*');
      if (reconnectAttempts < 5) {
        reconnectAttempts++;
        setTimeout(connectWebSocket, 1000 * reconnectAttempts);
      } else {
        appendLog('error', 'Unable to reconnect. Please refresh.');
      }
    });

    ws.addEventListener('error', () => {});
  }

  function sendCommand(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase() === 'logout') {
      appendLog('command', '> logout');
      doLogout();
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    appendLog('command', '> ' + trimmed);
    ws.send(JSON.stringify({ type: 'command', input: trimmed }));

    // Add to history
    if (commandHistory[0] !== trimmed) {
      commandHistory.unshift(trimmed);
      if (commandHistory.length > 50) commandHistory.pop();
    }
    historyIndex = -1;
  }

  // ---- Message Handling ----
  function handleMessage(msg) {
    if (msg.type !== 'room') appendLog(msg.type, msg.content);

    if (msg.type === 'room' && msg.data) {
      currentRoomData = msg.data;
      updateMapData(msg.data);
      updateRoomUI(msg.data);
      appendLog('text', msg.content);
    }

    // Update stats from status messages
    if (msg.data?.character) {
      updateStats(msg.data.character);
    }
  }

  function updateRoomUI(data) {
    roomTitle.textContent = data.title || '';

    // Room description under title (in same box; tap box to collapse)
    const titleBox = $('room-title-box');
    const descText = $('room-description-text');
    const descRow = titleBox.querySelector('.room-desc-row');
    if (data.description) {
      descText.innerHTML = formatContent(data.description);
      descText.style.display = '';
      if (descRow) descRow.classList.remove('compass-only');
    } else {
      descText.innerHTML = '';
      descText.style.display = 'none';
      if (descRow) descRow.classList.add('compass-only');
    }
    // Keep collapsed state: do not toggle titleBox.classList so user's choice persists across room changes

    // Exits: order N, S, E, W, NW, NE, SW, SE then others
    const EXIT_ORDER = ['north', 'south', 'east', 'west', 'northwest', 'northeast', 'southwest', 'southeast'];
    const exits = data.exits || [];
    const sorted = [...exits].sort((a, b) => {
      const ia = EXIT_ORDER.indexOf(a.direction.toLowerCase());
      const ib = EXIT_ORDER.indexOf(b.direction.toLowerCase());
      if (ia === -1 && ib === -1) return (a.direction < b.direction ? -1 : 1);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    exitsBar.innerHTML = '';
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'exits-chips-wrap';
    for (const exit of sorted) {
      const chip = document.createElement('button');
      chip.className = 'exit-chip';
      chip.textContent = exit.direction;
      chip.addEventListener('click', () => sendCommand(exit.direction));
      chipsWrap.appendChild(chip);
    }
    exitsBar.appendChild(chipsWrap);

    // Compass: 3x3 grid, highlight available directions; map button in center
    const compassMount = $('room-compass-mount');
    const btnMap = $('btn-map');
    const oldCompass = compassMount.querySelector('.exits-compass');
    if (oldCompass) {
      if (btnMap && oldCompass.contains(btnMap)) btnMap.remove();
      oldCompass.remove();
    }
    const compassDirOrder = ['northwest', 'north', 'northeast', 'west', null, 'east', 'southwest', 'south', 'southeast'];
    const exitSet = new Set(exits.map(e => e.direction.toLowerCase()));
    const compass = document.createElement('div');
    compass.className = 'exits-compass';
    compass.setAttribute('aria-label', 'Compass');
    const arrows = { north: '↑', south: '↓', east: '→', west: '←', northeast: '↗', northwest: '↖', southeast: '↘', southwest: '↙' };
    compassDirOrder.forEach(d => {
      const cell = document.createElement('span');
      if (d === null) {
        cell.className = 'compass-cell compass-center compass-map-cell';
        if (btnMap) cell.appendChild(btnMap);
      } else {
        cell.className = 'compass-cell' + (exitSet.has(d) ? ' compass-available' : ' compass-unavailable');
        cell.textContent = arrows[d] || '';
        cell.title = d;
      }
      compass.appendChild(cell);
    });
    compassMount.appendChild(compass);

    // Entities
    const npcs = data.npcs || [];
    const creatures = data.creatures || [];
    const players = data.players || [];

    if (npcs.length + creatures.length + players.length > 0) {
      entitiesPanel.classList.remove('hidden');
      entitiesList.innerHTML = '';

      for (const npc of npcs) {
        const chip = document.createElement('button');
        chip.className = 'entity-chip npc';
        chip.textContent = npc.name;
        chip.addEventListener('click', () => showEntityMenu(npc.name, 'npc'));
        entitiesList.appendChild(chip);
      }

      for (const c of creatures) {
        const chip = document.createElement('button');
        chip.className = 'entity-chip creature';
        chip.textContent = c.name;
        chip.addEventListener('click', () => showEntityMenu(c.name, 'creature'));
        entitiesList.appendChild(chip);
      }

      for (const p of players) {
        const chip = document.createElement('button');
        chip.className = 'entity-chip player';
        chip.textContent = p.name;
        chip.addEventListener('click', () => showEntityMenu(p.name, 'player'));
        entitiesList.appendChild(chip);
      }
    } else {
      entitiesPanel.classList.add('hidden');
    }

    // Show combat row when creatures present
    if (creatures.length > 0 || !data.safeZone) {
      if (combatRow) combatRow.classList.remove('hidden');
    } else {
      if (combatRow) combatRow.classList.add('hidden');
    }
  }

  function showEntityMenu(name, type) {
    if (type === 'npc') {
      cmdInput.value = `${name}: `;
    } else if (type === 'creature') {
      cmdInput.value = `attack ${name}`;
    } else if (type === 'player') {
      cmdInput.value = `whisper ${name} `;
    }
    cmdInput.focus();
  }

  let statsTimeout = null;
  function updateStats(char) {
    const bar = $('player-stats');
    $('stat-hp').textContent = `HP: ${char.health}/${char.health_max}`;
    $('stat-sp').textContent = `SP: ${char.stamina}/${char.stamina_max}`;
    $('stat-level').textContent = `Lv: ${char.level}`;

    const hpPct = char.health / char.health_max;
    $('stat-hp').style.color = hpPct > 0.5 ? 'var(--success)' : hpPct > 0.25 ? 'var(--accent)' : 'var(--danger)';

    bar.style.display = '';
    clearTimeout(statsTimeout);
    statsTimeout = setTimeout(() => { bar.style.display = 'none'; }, 8000);
  }

  // ---- Map ----
  const DIR_DELTA = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], northeast: [1, 1], northwest: [-1, 1], southeast: [1, -1], southwest: [-1, -1], up: [0, 0], down: [0, 0], in: [0, 0], out: [0, 0] };

  function updateMapData(data) {
    if (!data.regionId) return;
    if (data.regionId !== mapRegionId) {
      mapRegionId = data.regionId;
      mapVisited = new Set();
      mapEdges = [];
    }
    mapVisited.add(data.roomId);
    const exits = data.exits || [];
    const edgeKey = (a, b) => a + '|' + b;
    const have = new Set(mapEdges.map(e => edgeKey(e.from, e.to)));
    for (const ex of exits) {
      if (ex.to_room_id && !have.has(edgeKey(data.roomId, ex.to_room_id))) {
        have.add(edgeKey(data.roomId, ex.to_room_id));
        mapEdges.push({ from: data.roomId, to: ex.to_room_id, direction: ex.direction });
      }
    }
  }

  function layoutMap(currentRoomId) {
    const pos = new Map();
    const queue = [{ id: currentRoomId, x: 0, y: 0 }];
    const seen = new Set([currentRoomId]);
    pos.set(currentRoomId, [0, 0]);
    while (queue.length > 0) {
      const { id, x, y } = queue.shift();
      for (const e of mapEdges) {
        if (e.from !== id) continue;
        if (!mapVisited.has(e.to)) continue;
        const delta = DIR_DELTA[e.direction.toLowerCase()] || [0, 0];
        const nx = x + delta[0];
        const ny = y + delta[1];
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        pos.set(e.to, [nx, ny]);
        queue.push({ id: e.to, x: nx, y: ny });
      }
    }
    return pos;
  }

  function renderMap() {
    const modal = $('map-modal');
    const canvas = $('map-canvas');
    const wrap = $('map-canvas-wrap');
    const titleEl = $('map-modal-title');
    if (!modal || !canvas || !wrap || !currentRoomData) return;
    const currentRoomId = currentRoomData.roomId;
    titleEl.textContent = currentRoomData.regionName ? `Map — ${currentRoomData.regionName}` : 'Map';
    const positions = layoutMap(currentRoomId);

    const rect = wrap.getBoundingClientRect();
    const w = Math.floor(rect.width) || 300;
    const h = Math.floor(rect.height) || 300;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim() || '#222';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const vals = Array.from(positions.values());
    if (vals.length === 0) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#8a7e65';
      ctx.font = '14px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No map data yet.', w / 2, h / 2);
      return;
    }

    const cell = 32;
    const box = 14;
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent').trim() || '#c49a3c';
    const border = cs.getPropertyValue('--border').trim() || '#3a3a3a';
    const textDim = cs.getPropertyValue('--text-dim').trim() || '#8a7e65';
    const bgPanel = bg;

    const toCanvas = (gx, gy) => [w / 2 + gx * cell, h / 2 - gy * cell];

    // Draw lines between visited rooms
    for (const e of mapEdges) {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      if (!a || !b) continue;
      const [x1, y1] = toCanvas(a[0], a[1]);
      const [x2, y2] = toCanvas(b[0], b[1]);
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw stubs + ? for unvisited exits from visited rooms
    const unknownDrawn = new Set();
    for (const e of mapEdges) {
      if (mapVisited.has(e.to)) continue;
      const fromPos = positions.get(e.from);
      if (!fromPos) continue;
      const delta = DIR_DELTA[e.direction.toLowerCase()];
      if (!delta || (delta[0] === 0 && delta[1] === 0)) continue;
      const stubKey = fromPos[0] + delta[0] + ',' + (fromPos[1] + delta[1]);
      if (unknownDrawn.has(stubKey)) continue;
      unknownDrawn.add(stubKey);
      const [x1, y1] = toCanvas(fromPos[0], fromPos[1]);
      const stubLen = cell * 0.6;
      const dx = delta[0], dy = -delta[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const ex = x1 + (dx / len) * stubLen;
      const ey = y1 + (dy / len) * stubLen;
      ctx.strokeStyle = textDim;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = textDim;
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', ex, ey);
    }

    // Draw visited room boxes
    for (const [id, p] of positions.entries()) {
      const [cx, cy] = toCanvas(p[0], p[1]);
      const isCurrent = id === currentRoomId;
      ctx.fillStyle = isCurrent ? accent : bgPanel;
      ctx.strokeStyle = isCurrent ? accent : border;
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.fillRect(cx - box / 2, cy - box / 2, box, box);
      ctx.strokeRect(cx - box / 2, cy - box / 2, box, box);
    }
  }

  function openMapModal() {
    const modal = $('map-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderMap();
  }

  function closeMapModal() {
    const modal = $('map-modal');
    if (modal) modal.classList.add('hidden');
  }

  if ($('btn-map')) $('btn-map').addEventListener('click', openMapModal);
  if ($('map-modal-close')) $('map-modal-close').addEventListener('click', closeMapModal);

  // ---- Log Output ----
  const MAX_LOG_ENTRIES = 300;

  function appendLog(type, content) {
    const entry = document.createElement('div');
    entry.className = `log-entry type-${type}`;
    entry.innerHTML = formatContent(content);
    gameLog.appendChild(entry);

    // Prune old entries
    while (gameLog.children.length > MAX_LOG_ENTRIES) {
      gameLog.removeChild(gameLog.firstChild);
    }

    // Auto-scroll
    gameLog.scrollTop = gameLog.scrollHeight;
  }

  function formatContent(text) {
    if (!text) return '';
    // Convert markdown-style bold/italic
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Input Handling ----
  $('btn-send').addEventListener('click', () => {
    sendCommand(cmdInput.value);
    cmdInput.value = '';
  });

  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand(cmdInput.value);
      cmdInput.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        cmdInput.value = commandHistory[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        cmdInput.value = commandHistory[historyIndex];
      } else {
        historyIndex = -1;
        cmdInput.value = '';
      }
    }
  });

  // Arrow keys: north, south, east, west (only when input is not focused)
  const ARROW_MAP = { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east' };
  // Keypad 1-9 movement
  const KEYPAD_MAP = { '7': 'northwest', '8': 'north', '9': 'northeast', '4': 'west', '5': 'look', '6': 'east', '1': 'southwest', '2': 'south', '3': 'southeast' };
  document.addEventListener('keydown', (e) => {
    if (!screenGame.classList.contains('active')) return;
    if (document.activeElement === cmdInput) return;
    const cmd = ARROW_MAP[e.key] || (e.key && e.key.length === 1 ? KEYPAD_MAP[e.key] : null);
    if (cmd) {
      e.preventDefault();
      sendCommand(cmd);
    }
  });

  // ---- Button Handlers ----
  // Action buttons
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) sendCommand(cmd);
    });
  });

  // ---- Hotkey Bar ----
  function renderHotkeys() {
    if (!hotkeyBar) return;
    hotkeyBar.innerHTML = '';
    for (const hk of hotkeys) {
      const btn = document.createElement('button');
      btn.className = 'hotkey-btn';
      btn.textContent = hk.label;
      btn.addEventListener('click', () => {
        if (hk.label === 'Say') {
          const msg = prompt('What do you want to say?');
          if (msg != null && msg.trim()) sendCommand('"' + msg.trim() + '"');
        } else {
          sendCommand(hk.cmd);
        }
      });
      hotkeyBar.appendChild(btn);
    }
  }

  // Room title row (title + chevron): click to collapse/expand description row
  const roomTitleRow = $('room-title-row');
  const roomTitleBox = $('room-title-box');
  if (roomTitleRow && roomTitleBox) {
    roomTitleRow.addEventListener('click', () => roomTitleBox.classList.toggle('collapsed'));
  }

  renderHotkeys();

  // ---- Mobile Keyboard Management ----
  // Prevent page bounce on iOS
  document.body.addEventListener('touchmove', (e) => {
    if (e.target === gameLog || gameLog.contains(e.target)) return;
    // Allow scrolling in game log only
  }, { passive: true });

  // Refocus handling — don't steal focus from input
  gameLog.addEventListener('click', () => {
    // Don't auto-focus input when scrolling log
  });

  // Restore session from storage on load (persists until logout)
  (function tryRestoreAuth() {
    const auth = getAuthStorage();
    if (auth && auth.accountId && auth.characterId) {
      accountId = auth.accountId;
      email = auth.email || '';
      characterId = auth.characterId;
      showScreen(screenGame);
      gameLog.innerHTML = '';
      connectWebSocket();
    }
  })();

})();

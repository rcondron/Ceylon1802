// Ceylon 1802 — Client Application
(function() {
  'use strict';

  // ---- State ----
  let accountId = null;
  let characterId = null;
  let username = null;
  let isAdmin = false;
  let ws = null;
  let reconnectAttempts = 0;
  let commandHistory = [];
  let historyIndex = -1;
  let currentRoomData = null;

  // Default hotkeys (customizable later)
  let hotkeys = [
    { label: 'Attack', cmd: 'attack' },
    { label: 'Forage', cmd: 'forage' },
    { label: 'Fish', cmd: 'fish' },
    { label: 'Get All', cmd: 'get all' },
    { label: 'Heal', cmd: 'eat bread' },
  ];

  // ---- DOM Refs ----
  const $ = (id) => document.getElementById(id);

  const screenAuth = $('screen-auth');
  const screenChar = $('screen-character');
  const screenGame = $('screen-game');

  const loginPanel = $('auth-login');
  const regPanel = $('auth-register');

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
  $('btn-show-register').addEventListener('click', () => {
    loginPanel.classList.add('hidden');
    regPanel.classList.remove('hidden');
  });

  $('btn-show-login').addEventListener('click', () => {
    regPanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
  });

  $('btn-login').addEventListener('click', async () => {
    const user = $('login-username').value.trim();
    const pass = $('login-password').value;
    if (!user || !pass) { $('login-error').textContent = 'Enter username and password'; return; }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { $('login-error').textContent = data.error; return; }

      accountId = data.accountId;
      username = data.username;
      isAdmin = data.isAdmin;
      showCharacterSelect(data.characters);
    } catch (e) {
      $('login-error').textContent = 'Connection error';
    }
  });

  $('btn-register').addEventListener('click', async () => {
    const user = $('reg-username').value.trim();
    const pass = $('reg-password').value;
    if (!user || !pass) { $('reg-error').textContent = 'Enter username and password'; return; }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { $('reg-error').textContent = data.error; return; }

      accountId = data.accountId;
      username = user;
      showCharacterSelect([]);
    } catch (e) {
      $('reg-error').textContent = 'Connection error';
    }
  });

  // Enter key on login/register
  $('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-login').click(); });
  $('reg-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-register').click(); });

  $('btn-logout').addEventListener('click', () => {
    accountId = null;
    characterId = null;
    if (ws) ws.close();
    showScreen(screenAuth);
  });

  // ---- Character Select ----
  function showCharacterSelect(characters) {
    showScreen(screenChar);
    const list = $('character-list');
    list.innerHTML = '';

    if (characters.length === 0) {
      list.innerHTML = '<p style="color:var(--text-dim);margin-bottom:12px;">No characters yet. Create one below.</p>';
    }

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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const trimmed = cmd.trim();
    if (!trimmed) return;

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
    appendLog(msg.type, msg.content);

    if (msg.type === 'room' && msg.data) {
      currentRoomData = msg.data;
      updateRoomUI(msg.data);
    }

    // Update stats from status messages
    if (msg.data?.character) {
      updateStats(msg.data.character);
    }
  }

  function updateRoomUI(data) {
    roomTitle.textContent = data.title || '';

    // Exits
    exitsBar.innerHTML = '';
    for (const exit of (data.exits || [])) {
      const chip = document.createElement('button');
      chip.className = 'exit-chip';
      chip.textContent = exit.direction;
      chip.addEventListener('click', () => sendCommand(exit.direction));
      exitsBar.appendChild(chip);
    }

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
      combatRow.classList.remove('hidden');
    } else {
      combatRow.classList.add('hidden');
    }
  }

  function showEntityMenu(name, type) {
    // Quick context: tap an entity to fill command
    if (type === 'npc') {
      cmdInput.value = `talk ${name}`;
    } else if (type === 'creature') {
      cmdInput.value = `attack ${name}`;
    } else if (type === 'player') {
      cmdInput.value = `whisper ${name} `;
    }
    cmdInput.focus();
  }

  function updateStats(char) {
    $('stat-hp').textContent = `HP: ${char.health}/${char.health_max}`;
    $('stat-sp').textContent = `SP: ${char.stamina}/${char.stamina_max}`;
    $('stat-level').textContent = `Lv: ${char.level}`;

    // Color code HP
    const hpPct = char.health / char.health_max;
    $('stat-hp').style.color = hpPct > 0.5 ? 'var(--success)' : hpPct > 0.25 ? 'var(--accent)' : 'var(--danger)';
  }

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

  // ---- Button Handlers ----
  // Action buttons
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) sendCommand(cmd);
    });
  });

  // Direction buttons
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) sendCommand(cmd);
    });
  });

  // ---- Hotkey Bar ----
  function renderHotkeys() {
    hotkeyBar.innerHTML = '';
    for (const hk of hotkeys) {
      const btn = document.createElement('button');
      btn.className = 'hotkey-btn';
      btn.textContent = hk.label;
      btn.addEventListener('click', () => sendCommand(hk.cmd));
      hotkeyBar.appendChild(btn);
    }
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

  // ---- Periodic Stats Refresh ----
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Silently request status update
      ws.send(JSON.stringify({ type: 'command', input: 'status' }));
    }
  }, 30000);

})();

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import db, { initDatabase } from './db';
import { gameState, OnlinePlayer } from './engine/GameState';
import { processCommand, creatureCombatTick, GameMessage } from './engine/commands';
import { adminRouter } from './routes/admin';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize database
initDatabase();

const app = express();
app.use(express.json());

// Serve static client files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Admin API routes
app.use('/api/admin', adminRouter);

// Auth routes
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }
  if (username.length < 3 || username.length > 20) { res.status(400).json({ error: 'Username must be 3-20 characters' }); return; }
  if (password.length < 4) { res.status(400).json({ error: 'Password must be at least 4 characters' }); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { res.status(400).json({ error: 'Username: letters, numbers, underscores only' }); return; }

  const existing = db.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
  if (existing) { res.status(409).json({ error: 'Username taken' }); return; }

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO accounts (id, username, password_hash) VALUES (?, ?, ?)').run(id, username, hash);

  res.json({ accountId: id, username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const account = db.prepare('SELECT * FROM accounts WHERE username = ?').get(username) as any;
  if (!account || !bcrypt.compareSync(password, account.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  db.prepare('UPDATE accounts SET last_login = datetime("now") WHERE id = ?').run(account.id);
  const characters = db.prepare('SELECT id, name, level, background FROM characters WHERE account_id = ?').all(account.id);
  res.json({ accountId: account.id, username: account.username, isAdmin: !!account.is_admin, characters });
});

app.post('/api/characters', (req, res) => {
  const { accountId, name, background } = req.body;
  if (!accountId || !name) { res.status(400).json({ error: 'Account ID and name required' }); return; }
  if (name.length < 2 || name.length > 20) { res.status(400).json({ error: 'Name must be 2-20 characters' }); return; }
  if (!/^[a-zA-Z]+$/.test(name)) { res.status(400).json({ error: 'Name: letters only' }); return; }

  const existing = db.prepare('SELECT id FROM characters WHERE name = ?').get(name);
  if (existing) { res.status(409).json({ error: 'Name taken' }); return; }

  // Get starting room
  const startRoom = db.prepare('SELECT id FROM rooms WHERE room_tags LIKE ? LIMIT 1').get('%"start"%') as any;
  const roomId = startRoom?.id || db.prepare('SELECT id FROM rooms WHERE safe_zone = 1 LIMIT 1').get()?.toString() || 'harbor_dock';

  const id = uuid();
  const bgStats: Record<string, Partial<Record<string, number>>> = {
    deckhand: { strength: 12, endurance: 12, agility: 11 },
    'ships_clerk': { intellect: 13, perception: 11, presence: 11 },
    'traders_assistant': { presence: 13, intellect: 11, perception: 11 },
    'runaway_apprentice': { agility: 13, perception: 12 },
    'farmers_child': { endurance: 13, strength: 12 },
    'former_soldier': { strength: 14, endurance: 12, willpower: 11 },
    'temple_student': { willpower: 13, intellect: 12, presence: 11 },
    'fishermans_kin': { perception: 13, agility: 11, endurance: 11 },
  };

  const stats = bgStats[background || 'deckhand'] || bgStats.deckhand;
  const charRoomId = typeof roomId === 'string' ? roomId : (roomId as any).id;

  db.prepare(`INSERT INTO characters (id, account_id, name, background, room_id,
    strength, agility, endurance, intellect, perception, presence, willpower)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, accountId, name, background || 'deckhand', charRoomId,
    stats.strength || 10, stats.agility || 10, stats.endurance || 10,
    stats.intellect || 10, stats.perception || 10, stats.presence || 10, stats.willpower || 10
  );

  // Give starting items based on background
  const starterItems: Record<string, string[]> = {
    deckhand: ['worn_cutlass', 'cotton_shirt', 'bread_loaf'],
    ships_clerk: ['quill_knife', 'cotton_shirt', 'bread_loaf', 'ledger_book'],
    traders_assistant: ['walking_stick', 'cotton_shirt', 'bread_loaf'],
    runaway_apprentice: ['small_knife', 'cotton_shirt', 'bread_loaf'],
    farmers_child: ['hatchet', 'cotton_shirt', 'bread_loaf'],
    former_soldier: ['worn_cutlass', 'leather_vest', 'bread_loaf'],
    temple_student: ['walking_stick', 'cotton_robe', 'bread_loaf'],
    fishermans_kin: ['small_knife', 'cotton_shirt', 'bread_loaf', 'fishing_line'],
  };

  const items = starterItems[background || 'deckhand'] || starterItems.deckhand;
  for (const itemId of items) {
    const item = db.prepare('SELECT id FROM items WHERE id = ?').get(itemId);
    if (item) {
      db.prepare('INSERT INTO inventory (id, character_id, item_id) VALUES (?, ?, ?)').run(uuid(), id, itemId);
    }
  }

  // Give starting skills
  const starterSkills = ['blades', 'defense', 'foraging'];
  for (const skillId of starterSkills) {
    const skill = db.prepare('SELECT id FROM skills WHERE id = ?').get(skillId);
    if (skill) {
      db.prepare('INSERT INTO character_skills (character_id, skill_id, level, experience) VALUES (?, ?, 1, 0)').run(id, skillId);
    }
  }

  res.json({ characterId: id, name });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Map WebSocket to characterId
const wsToChar = new Map<WebSocket, string>();

function sendToPlayer(characterId: string, msg: GameMessage): void {
  const player = gameState.getPlayer(characterId);
  if (player?.ws) {
    try {
      (player.ws as WebSocket).send(JSON.stringify(msg));
    } catch { /* disconnected */ }
  }
}

function broadcastToRoom(roomId: string, msg: GameMessage, excludeId?: string): void {
  const players = gameState.getPlayersInRoom(roomId);
  for (const p of players) {
    if (p.characterId !== excludeId) {
      sendToPlayer(p.characterId, msg);
    }
  }
}

wss.on('connection', (ws: WebSocket) => {
  let authenticated = false;
  let playerCharId: string | null = null;

  ws.on('message', (raw: Buffer) => {
    let data: any;
    try { data = JSON.parse(raw.toString()); } catch { return; }

    // Authentication message
    if (data.type === 'auth') {
      const { accountId, characterId } = data;
      if (!accountId || !characterId) { ws.send(JSON.stringify({ type: 'error', content: 'Invalid auth' })); return; }

      const char = db.prepare('SELECT * FROM characters WHERE id = ? AND account_id = ?').get(characterId, accountId) as any;
      if (!char) { ws.send(JSON.stringify({ type: 'error', content: 'Character not found' })); return; }

      // Check if already online
      const existing = gameState.getPlayer(characterId);
      if (existing) {
        try { (existing.ws as WebSocket).close(); } catch { /* ok */ }
        gameState.removePlayer(characterId);
      }

      const player: OnlinePlayer = {
        characterId: char.id,
        accountId: accountId,
        characterName: char.name,
        roomId: char.room_id,
        ws,
        combatTarget: null,
        combatCooldown: 0,
        lastAction: Date.now(),
        partyId: null,
      };

      gameState.addPlayer(player);
      wsToChar.set(ws, characterId);
      authenticated = true;
      playerCharId = characterId;

      db.prepare('UPDATE characters SET last_active = datetime("now") WHERE id = ?').run(characterId);

      // Welcome message
      sendToPlayer(characterId, { type: 'system', content: `Welcome back, **${char.name}**!` });

      // Announce to room
      broadcastToRoom(char.room_id, { type: 'text', content: `**${char.name}** arrives.` }, characterId);

      // Show room
      processCommand('look', player, sendToPlayer, broadcastToRoom);
      return;
    }

    // Game commands
    if (data.type === 'command' && authenticated && playerCharId) {
      const player = gameState.getPlayer(playerCharId);
      if (!player) return;
      player.lastAction = Date.now();
      processCommand(data.input || '', player, sendToPlayer, broadcastToRoom);
    }
  });

  ws.on('close', () => {
    const charId = wsToChar.get(ws);
    if (charId) {
      const player = gameState.getPlayer(charId);
      if (player) {
        broadcastToRoom(player.roomId, { type: 'text', content: `**${player.characterName}** departs.` }, charId);
        gameState.removePlayer(charId);
      }
      wsToChar.delete(ws);
    }
  });
});

// Game tick — creature combat AI
setInterval(() => {
  creatureCombatTick(sendToPlayer, broadcastToRoom);
}, 1000);

// Spawn tick — check room spawns periodically
setInterval(() => {
  for (const player of gameState.players.values()) {
    // Check spawns in rooms with players
    const room = db.prepare('SELECT spawn_table_id FROM rooms WHERE id = ?').get(player.roomId) as any;
    if (room?.spawn_table_id) {
      const existing = gameState.getCreaturesInRoom(player.roomId);
      const table = db.prepare('SELECT * FROM spawn_tables WHERE id = ?').get(room.spawn_table_id) as any;
      if (table && existing.length < table.max_concurrent) {
        const lastSpawn = gameState.roomSpawnTimers.get(player.roomId) || 0;
        if (Date.now() - lastSpawn > table.respawn_seconds * 1000) {
          const entries = JSON.parse(table.entries || '[]');
          const entry = entries[Math.floor(Math.random() * entries.length)];
          if (entry) {
            const spawned = gameState.spawnCreature(entry.creature_id, player.roomId);
            if (spawned) {
              broadcastToRoom(player.roomId, { type: 'text', content: `A **${spawned.name}** appears!` });
            }
            gameState.roomSpawnTimers.set(player.roomId, Date.now());
          }
        }
      }
    }
  }
}, 5000);

// Health/stamina regen tick
setInterval(() => {
  for (const player of gameState.players.values()) {
    if (!player.combatTarget) {
      db.prepare(`UPDATE characters SET
        health = MIN(health_max, health + CAST(health_max * 0.02 AS INTEGER) + 1),
        stamina = MIN(stamina_max, stamina + CAST(stamina_max * 0.05 AS INTEGER) + 1)
        WHERE id = ? AND (health < health_max OR stamina < stamina_max)`)
        .run(player.characterId);
    }
  }
}, 10000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ceylon 1802 server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to play`);
});

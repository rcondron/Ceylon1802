import { Router, Request, Response } from 'express';
import db from '../db';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';

export const adminRouter = Router();

const DEFAULT_ADMIN_PASS = 'Test123';

function getAdminPasswordHash(): string {
  const row = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password_hash'").get() as any;
  if (row) return row.value;
  const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASS, 10);
  db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").run(hash);
  return hash;
}

// Standalone admin login (not tied to game accounts)
adminRouter.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password) { res.status(400).json({ error: 'Password required' }); return; }
  const hash = getAdminPasswordHash();
  if (!bcrypt.compareSync(password, hash)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  const token = uuid();
  db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_token', ?)").run(token);
  res.json({ token });
});

function requireAdmin(req: Request, res: Response, next: Function): void {
  const token = req.headers['x-admin-token'] as string;
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const stored = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_token'").get() as any;
  if (!stored || stored.value !== token) { res.status(403).json({ error: 'Invalid token' }); return; }
  next();
}

// Change admin password
adminRouter.post('/change-password', requireAdmin, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) { res.status(400).json({ error: 'Both current and new password required' }); return; }
  if (newPassword.length < 4) { res.status(400).json({ error: 'New password must be at least 4 characters' }); return; }
  const hash = getAdminPasswordHash();
  if (!bcrypt.compareSync(currentPassword, hash)) { res.status(401).json({ error: 'Current password is incorrect' }); return; }
  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").run(newHash);
  res.json({ success: true });
});

// --- Regions ---
adminRouter.get('/regions', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM regions ORDER BY name').all());
});

adminRouter.post('/regions', requireAdmin, (req, res) => {
  const { id, name, description, level_range_min, level_range_max, tags } = req.body;
  const regionId = id || uuid();
  db.prepare('INSERT OR REPLACE INTO regions (id, name, description, level_range_min, level_range_max, tags) VALUES (?, ?, ?, ?, ?, ?)')
    .run(regionId, name, description || '', level_range_min || 1, level_range_max || 5, JSON.stringify(tags || []));
  res.json({ id: regionId });
});

adminRouter.delete('/regions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM regions WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// --- Rooms ---
adminRouter.get('/rooms', requireAdmin, (req, res) => {
  const regionId = req.query.region_id as string;
  if (regionId) {
    res.json(db.prepare('SELECT * FROM rooms WHERE region_id = ? ORDER BY title').all(regionId));
  } else {
    res.json(db.prepare('SELECT * FROM rooms ORDER BY region_id, title').all());
  }
});

adminRouter.get('/rooms/:id', requireAdmin, (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
  const exits = db.prepare('SELECT * FROM exits WHERE from_room_id = ?').all(req.params.id);
  const gates = db.prepare('SELECT * FROM gates WHERE from_room_id = ?').all(req.params.id);
  res.json({ ...room as any, exits, gates });
});

adminRouter.post('/rooms', requireAdmin, (req, res) => {
  const r = req.body;
  const roomId = r.id || uuid();
  db.prepare(`INSERT OR REPLACE INTO rooms (id, region_id, title, description_long, description_short,
    terrain_type, safe_zone, light_level, weather_exposure, ambient_text_pool, interactable_objects,
    room_tags, required_flags, resource_nodes, spawn_table_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(roomId, r.region_id, r.title, r.description_long, r.description_short || '',
      r.terrain_type || 'urban', r.safe_zone ? 1 : 0, r.light_level || 'bright',
      r.weather_exposure || 'sheltered', JSON.stringify(r.ambient_text_pool || []),
      JSON.stringify(r.interactable_objects || []), JSON.stringify(r.room_tags || []),
      JSON.stringify(r.required_flags || []), JSON.stringify(r.resource_nodes || []),
      r.spawn_table_id || null);

  // Handle exits
  if (r.exits) {
    db.prepare('DELETE FROM exits WHERE from_room_id = ?').run(roomId);
    for (const exit of r.exits) {
      db.prepare('INSERT INTO exits (from_room_id, to_room_id, direction, description, required_flags, hidden) VALUES (?, ?, ?, ?, ?, ?)')
        .run(roomId, exit.to_room_id, exit.direction, exit.description || null,
          JSON.stringify(exit.required_flags || []), exit.hidden ? 1 : 0);
    }
  }

  // Handle gates
  if (r.gates) {
    db.prepare('DELETE FROM gates WHERE from_room_id = ?').run(roomId);
    for (const gate of r.gates) {
      db.prepare('INSERT INTO gates (from_room_id, to_room_id, keywords, description) VALUES (?, ?, ?, ?)')
        .run(roomId, gate.to_room_id, gate.keywords || '', gate.description || null);
    }
  }

  res.json({ id: roomId });
});

adminRouter.delete('/rooms/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM exits WHERE from_room_id = ? OR to_room_id = ?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM gates WHERE from_room_id = ? OR to_room_id = ?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// --- Items ---
adminRouter.get('/items', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM items ORDER BY category, name').all());
});

adminRouter.post('/items', requireAdmin, (req, res) => {
  const i = req.body;
  const itemId = i.id || uuid();
  db.prepare(`INSERT OR REPLACE INTO items (id, item_key, name, description, category, slot, weight, value,
    rarity, stackable, max_stack, durability_max, properties, tags, lore_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(itemId, i.item_key || null, i.name, i.description, i.category, i.slot || null, i.weight || 1,
      i.value || 0, i.rarity || 'common', i.stackable ? 1 : 0, i.max_stack || 1,
      i.durability_max || 100, JSON.stringify(i.properties || {}), JSON.stringify(i.tags || []),
      i.lore_text || null);
  res.json({ id: itemId });
});

// --- NPCs ---
adminRouter.get('/npcs', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM npcs ORDER BY name').all());
});

adminRouter.post('/npcs', requireAdmin, (req, res) => {
  const n = req.body;
  const npcId = n.id || uuid();
  db.prepare(`INSERT OR REPLACE INTO npcs (id, name, role, room_id, home_region, description,
    personality_traits, speech_style, backstory, faction_affiliation, quest_links,
    shop_inventory, dialogue_tree, ai_prompt_base, ai_safety_rules, knowledge_tags,
    schedule, response_boundaries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(npcId, n.name, n.role, n.room_id || null, n.home_region || null, n.description || '',
      JSON.stringify(n.personality_traits || []), n.speech_style || null, n.backstory || null,
      n.faction_affiliation || null, JSON.stringify(n.quest_links || []),
      JSON.stringify(n.shop_inventory || []), JSON.stringify(n.dialogue_tree || {}),
      n.ai_prompt_base || null, n.ai_safety_rules || null,
      JSON.stringify(n.knowledge_tags || []), JSON.stringify(n.schedule || {}),
      JSON.stringify(n.response_boundaries || []));
  res.json({ id: npcId });
});

// --- Creatures ---
adminRouter.get('/creatures', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM creatures ORDER BY level, name').all());
});

adminRouter.post('/creatures', requireAdmin, (req, res) => {
  const c = req.body;
  const creatureId = c.id || uuid();
  db.prepare(`INSERT OR REPLACE INTO creatures (id, name, description, level, health_max,
    attack_min, attack_max, defense, accuracy, dodge, attack_speed, behavior,
    loot_table, experience_reward, habitat_tags, ambient_actions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(creatureId, c.name, c.description || '', c.level || 1, c.health_max || 20,
      c.attack_min || 2, c.attack_max || 6, c.defense || 1, c.accuracy || 60,
      c.dodge || 10, c.attack_speed || 3.0, c.behavior || 'aggressive',
      JSON.stringify(c.loot_table || []), c.experience_reward || 10,
      JSON.stringify(c.habitat_tags || []), JSON.stringify(c.ambient_actions || []));
  res.json({ id: creatureId });
});

// --- Quests ---
adminRouter.get('/quests', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM quests ORDER BY level_requirement, name').all());
});

adminRouter.post('/quests', requireAdmin, (req, res) => {
  const q = req.body;
  const questId = q.id || uuid();
  db.prepare(`INSERT OR REPLACE INTO quests (id, name, description, quest_giver_npc_id,
    prerequisites, objectives, rewards, repeatable, level_requirement, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(questId, q.name, q.description, q.quest_giver_npc_id || null,
      JSON.stringify(q.prerequisites || []), JSON.stringify(q.objectives || []),
      JSON.stringify(q.rewards || {}), q.repeatable ? 1 : 0,
      q.level_requirement || 1, q.category || 'errand');
  res.json({ id: questId });
});

// --- Skills ---
adminRouter.get('/skills', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM skills ORDER BY category, name').all());
});

adminRouter.post('/skills', requireAdmin, (req, res) => {
  const s = req.body;
  const skillId = s.id || uuid();
  db.prepare('INSERT OR REPLACE INTO skills (id, skill_key, name, category, description, max_level) VALUES (?, ?, ?, ?, ?, ?)')
    .run(skillId, s.skill_key || null, s.name, s.category, s.description || '', s.max_level || 100);
  res.json({ id: skillId });
});

// --- Spawn Tables ---
adminRouter.get('/spawn-tables', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM spawn_tables').all());
});

adminRouter.post('/spawn-tables', requireAdmin, (req, res) => {
  const st = req.body;
  const tableId = st.id || uuid();
  db.prepare('INSERT OR REPLACE INTO spawn_tables (id, entries, max_concurrent, respawn_seconds) VALUES (?, ?, ?, ?)')
    .run(tableId, JSON.stringify(st.entries || []), st.max_concurrent || 3, st.respawn_seconds || 120);
  res.json({ id: tableId });
});

// --- Recipes ---
adminRouter.get('/recipes', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM recipes ORDER BY name').all());
});

adminRouter.post('/recipes', requireAdmin, (req, res) => {
  const r = req.body;
  const recipeId = r.id || uuid();
  db.prepare(`INSERT OR REPLACE INTO recipes (id, name, skill_id, skill_level_required,
    ingredients, output_item_id, output_quantity, success_base_chance, crafting_time_seconds, required_station)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(recipeId, r.name, r.skill_id || null, r.skill_level_required || 1,
      JSON.stringify(r.ingredients || []), r.output_item_id || null, r.output_quantity || 1,
      r.success_base_chance || 0.8, r.crafting_time_seconds || 5, r.required_station || null);
  res.json({ id: recipeId });
});

// --- Analytics ---
adminRouter.get('/analytics', requireAdmin, (_req, res) => {
  const totalAccounts = (db.prepare('SELECT COUNT(*) as c FROM accounts').get() as any).c;
  const totalCharacters = (db.prepare('SELECT COUNT(*) as c FROM characters').get() as any).c;
  const totalRooms = (db.prepare('SELECT COUNT(*) as c FROM rooms').get() as any).c;
  const totalNpcs = (db.prepare('SELECT COUNT(*) as c FROM npcs').get() as any).c;
  const totalItems = (db.prepare('SELECT COUNT(*) as c FROM items').get() as any).c;
  const totalQuests = (db.prepare('SELECT COUNT(*) as c FROM quests').get() as any).c;

  res.json({
    totalAccounts,
    totalCharacters,
    totalRooms,
    totalNpcs,
    totalItems,
    totalQuests,
    onlinePlayers: Array.from(require('../engine/GameState').gameState.players.values()).map((p: any) => ({
      name: p.characterName,
      roomId: p.roomId,
    })),
  });
});

// --- Moderation ---
adminRouter.get('/players', requireAdmin, (_req, res) => {
  res.json(db.prepare(`
    SELECT c.*, a.username, a.is_admin FROM characters c
    JOIN accounts a ON c.account_id = a.id ORDER BY c.last_active DESC
  `).all());
});

adminRouter.post('/players/:id/ban', requireAdmin, (req, res) => {
  // Simple ban by removing account
  const char = db.prepare('SELECT account_id FROM characters WHERE id = ?').get(req.params.id) as any;
  if (char) {
    db.prepare('UPDATE accounts SET parental_controls = ? WHERE id = ?')
      .run(JSON.stringify({ banned: true, reason: req.body.reason || 'Admin action' }), char.account_id);
  }
  res.json({ banned: true });
});

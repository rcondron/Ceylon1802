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

// --- Accounts ---
adminRouter.get('/accounts', requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.email, a.created_at, a.last_login, a.is_admin, a.blocked, a.blocked_reason,
           (SELECT COUNT(*) FROM characters c WHERE c.account_id = a.id) AS character_count,
           (SELECT COUNT(*) FROM reports r WHERE r.target_account_id = a.id AND r.status = 'open') AS open_report_count
    FROM accounts a ORDER BY a.created_at DESC
  `).all();
  res.json(rows);
});

adminRouter.post('/accounts', requireAdmin, (req, res) => {
  const { email, password, is_admin } = req.body;
  if (!email || !password) { res.status(400).json({ error: 'Email and password are required' }); return; }
  if (password.length < 4) { res.status(400).json({ error: 'Password must be at least 4 characters' }); return; }
  const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) { res.status(409).json({ error: 'An account with this email already exists' }); return; }
  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO accounts (id, email, password_hash, is_admin) VALUES (?, ?, ?, ?)').run(id, email.toLowerCase().trim(), hash, is_admin ? 1 : 0);
  res.json({ id, email: email.toLowerCase().trim() });
});

adminRouter.delete('/accounts/:id', requireAdmin, (req, res) => {
  const account = db.prepare('SELECT is_admin FROM accounts WHERE id = ?').get(req.params.id) as any;
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
  if (account.is_admin) { res.status(403).json({ error: 'Admin accounts cannot be deleted' }); return; }
  const chars = db.prepare('SELECT id FROM characters WHERE account_id = ?').all(req.params.id) as any[];
  for (const c of chars) {
    db.prepare('DELETE FROM inventory WHERE character_id = ?').run(c.id);
    db.prepare('DELETE FROM character_skills WHERE character_id = ?').run(c.id);
    db.prepare('DELETE FROM character_quests WHERE character_id = ?').run(c.id);
  }
  db.prepare('DELETE FROM characters WHERE account_id = ?').run(req.params.id);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

adminRouter.get('/accounts/:id/characters', requireAdmin, (req, res) => {
  const chars = db.prepare('SELECT * FROM characters WHERE account_id = ? ORDER BY name').all(req.params.id);
  res.json(chars);
});

adminRouter.post('/accounts/:id/characters', requireAdmin, (req, res) => {
  const accountId = req.params.id;
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const { name, background } = req.body;
  if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
  if (name.length < 2 || name.length > 20) { res.status(400).json({ error: 'Name must be 2-20 characters' }); return; }
  if (!/^[a-zA-Z]+$/.test(name)) { res.status(400).json({ error: 'Name: letters only' }); return; }

  const existing = db.prepare('SELECT id FROM characters WHERE name = ?').get(name);
  if (existing) { res.status(409).json({ error: 'Name already taken' }); return; }

  const startRoom = db.prepare('SELECT id FROM rooms WHERE room_tags LIKE ? LIMIT 1').get('%"start"%') as any;
  const safeRoom = db.prepare('SELECT id FROM rooms WHERE safe_zone = 1 LIMIT 1').get() as any;
  const firstRoom = db.prepare('SELECT id FROM rooms LIMIT 1').get() as any;
  const roomId = startRoom?.id ?? safeRoom?.id ?? firstRoom?.id;
  if (!roomId) { res.status(500).json({ error: 'No rooms in world — run seed first' }); return; }

  const bgStats: Record<string, Record<string, number>> = {
    deckhand: { strength: 12, endurance: 12, agility: 11 },
    ships_clerk: { intellect: 13, perception: 11, presence: 11 },
    traders_assistant: { presence: 13, intellect: 11, perception: 11 },
    runaway_apprentice: { agility: 13, perception: 12 },
    farmers_child: { endurance: 13, strength: 12 },
    former_soldier: { strength: 14, endurance: 12, willpower: 11 },
    temple_student: { willpower: 13, intellect: 12, presence: 11 },
    fishermans_kin: { perception: 13, agility: 11, endurance: 11 },
  };
  const stats = bgStats[background || 'deckhand'] || bgStats.deckhand;

  const id = uuid();
  db.prepare(`INSERT INTO characters (id, account_id, name, background, room_id,
    strength, agility, endurance, intellect, perception, presence, willpower)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, accountId, name, background || 'deckhand', roomId,
    stats.strength || 10, stats.agility || 10, stats.endurance || 10,
    stats.intellect || 10, stats.perception || 10, stats.presence || 10, stats.willpower || 10
  );

  const starterClothing = ['cotton_shirt', 'brown_leather_pants', 'canvas_sack', 'brown_leather_boots'];
  for (const key of starterClothing) {
    const item = db.prepare('SELECT id, slot FROM items WHERE item_key = ?').get(key) as any;
    if (item?.slot) {
      db.prepare('INSERT INTO inventory (id, character_id, item_id, equipped, equipped_slot) VALUES (?, ?, ?, 1, ?)').run(uuid(), id, item.id, item.slot);
    }
  }

  const starterItems: Record<string, string[]> = {
    deckhand: ['worn_cutlass', 'bread_loaf'],
    ships_clerk: ['quill_knife', 'bread_loaf', 'ledger_book'],
    traders_assistant: ['walking_stick', 'bread_loaf'],
    runaway_apprentice: ['small_knife', 'bread_loaf'],
    farmers_child: ['hatchet', 'bread_loaf'],
    former_soldier: ['worn_cutlass', 'leather_vest', 'bread_loaf'],
    temple_student: ['walking_stick', 'cotton_robe', 'bread_loaf'],
    fishermans_kin: ['small_knife', 'bread_loaf', 'fishing_line'],
  };
  const itemKeys = starterItems[background || 'deckhand'] || starterItems.deckhand;
  for (const key of itemKeys) {
    const item = db.prepare('SELECT id, slot, category FROM items WHERE item_key = ?').get(key) as any;
    if (item) {
      const invId = uuid();
      if (item.slot === 'hand') {
        const rightTaken = db.prepare("SELECT id FROM inventory WHERE character_id = ? AND equipped_slot = 'right_hand'").get(id);
        const hand = rightTaken ? 'left_hand' : 'right_hand';
        db.prepare('INSERT INTO inventory (id, character_id, item_id, equipped, equipped_slot) VALUES (?, ?, ?, 1, ?)').run(invId, id, item.id, hand);
      } else if (item.slot) {
        db.prepare('INSERT INTO inventory (id, character_id, item_id, equipped, equipped_slot) VALUES (?, ?, ?, 1, ?)').run(invId, id, item.id, item.slot);
      } else {
        db.prepare('INSERT INTO inventory (id, character_id, item_id) VALUES (?, ?, ?)').run(invId, id, item.id);
      }
    }
  }

  const starterSkillKeys = ['blades', 'defense', 'foraging'];
  for (const key of starterSkillKeys) {
    const skill = db.prepare('SELECT id FROM skills WHERE skill_key = ?').get(key) as any;
    if (skill) {
      db.prepare('INSERT INTO character_skills (character_id, skill_id, level, experience) VALUES (?, ?, 1, 0)').run(id, skill.id);
    }
  }

  res.json({ id, name });
});

adminRouter.delete('/characters/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM inventory WHERE character_id = ?').run(req.params.id);
  db.prepare('DELETE FROM character_skills WHERE character_id = ?').run(req.params.id);
  db.prepare('DELETE FROM character_quests WHERE character_id = ?').run(req.params.id);
  db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// --- Moderation ---
adminRouter.get('/players', requireAdmin, (_req, res) => {
  res.json(db.prepare(`
    SELECT c.*, a.email, a.is_admin, a.blocked FROM characters c
    JOIN accounts a ON c.account_id = a.id ORDER BY c.last_active DESC
  `).all());
});

// Block / Unblock accounts
adminRouter.post('/accounts/:id/block', requireAdmin, (req, res) => {
  const { reason } = req.body;
  db.prepare('UPDATE accounts SET blocked = 1, blocked_reason = ? WHERE id = ?').run(reason || null, req.params.id);
  res.json({ blocked: true });
});

adminRouter.post('/accounts/:id/unblock', requireAdmin, (_req, res) => {
  db.prepare('UPDATE accounts SET blocked = 0, blocked_reason = NULL WHERE id = ?').run(_req.params.id);
  res.json({ blocked: false });
});

// --- Reports ---
adminRouter.get('/reports', requireAdmin, (req, res) => {
  const status = req.query.status as string;
  let query = `
    SELECT r.*, reporter.name AS reporter_name
    FROM reports r
    LEFT JOIN characters reporter ON r.reporter_character_id = reporter.id
  `;
  if (status) {
    query += ' WHERE r.status = ? ORDER BY r.created_at DESC';
    res.json(db.prepare(query).all(status));
  } else {
    query += ' ORDER BY r.created_at DESC';
    res.json(db.prepare(query).all());
  }
});

adminRouter.get('/accounts/:id/reports', requireAdmin, (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, reporter.name AS reporter_name
    FROM reports r
    LEFT JOIN characters reporter ON r.reporter_character_id = reporter.id
    WHERE r.target_account_id = ? ORDER BY r.created_at DESC
  `).all(req.params.id);
  res.json(reports);
});

adminRouter.post('/reports/:id/resolve', requireAdmin, (req, res) => {
  const { admin_note } = req.body;
  db.prepare("UPDATE reports SET status = 'resolved', admin_note = ?, resolved_at = datetime('now') WHERE id = ?")
    .run(admin_note || null, req.params.id);
  res.json({ resolved: true });
});

adminRouter.post('/reports/:id/dismiss', requireAdmin, (req, res) => {
  const { admin_note } = req.body;
  db.prepare("UPDATE reports SET status = 'dismissed', admin_note = ?, resolved_at = datetime('now') WHERE id = ?")
    .run(admin_note || null, req.params.id);
  res.json({ dismissed: true });
});

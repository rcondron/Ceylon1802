import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';

// Use project root so seed (node dist/...) and server (tsx or node) share the same DB
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'ceylon.db');

const db: DatabaseType = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    -- Regions
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      level_range_min INTEGER DEFAULT 1,
      level_range_max INTEGER DEFAULT 5,
      tags TEXT DEFAULT '[]'
    );

    -- Rooms
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL REFERENCES regions(id),
      title TEXT NOT NULL,
      description_long TEXT NOT NULL,
      description_short TEXT,
      terrain_type TEXT DEFAULT 'urban',
      safe_zone INTEGER DEFAULT 0,
      light_level TEXT DEFAULT 'bright',
      weather_exposure TEXT DEFAULT 'sheltered',
      ambient_text_pool TEXT DEFAULT '[]',
      interactable_objects TEXT DEFAULT '[]',
      room_tags TEXT DEFAULT '[]',
      required_flags TEXT DEFAULT '[]',
      resource_nodes TEXT DEFAULT '[]',
      spawn_table_id TEXT
    );

    -- Room exits (cardinal directions: north, south, east, west — for movement within a region)
    CREATE TABLE IF NOT EXISTS exits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_room_id TEXT NOT NULL REFERENCES rooms(id),
      to_room_id TEXT NOT NULL REFERENCES rooms(id),
      direction TEXT NOT NULL,
      description TEXT,
      required_flags TEXT DEFAULT '[]',
      hidden INTEGER DEFAULT 0
    );

    -- Gates (cross-region: go forge, go grove, go first door — keywords, not directions)
    CREATE TABLE IF NOT EXISTS gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_room_id TEXT NOT NULL REFERENCES rooms(id),
      to_room_id TEXT NOT NULL REFERENCES rooms(id),
      keywords TEXT NOT NULL,
      description TEXT
    );

    -- Item templates (id is GUID; item_key is optional stable key for lookups e.g. starter items)
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      item_key TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      slot TEXT,
      weight REAL DEFAULT 1.0,
      value INTEGER DEFAULT 0,
      rarity TEXT DEFAULT 'common',
      stackable INTEGER DEFAULT 0,
      max_stack INTEGER DEFAULT 1,
      durability_max INTEGER DEFAULT 100,
      properties TEXT DEFAULT '{}',
      tags TEXT DEFAULT '[]',
      lore_text TEXT,
      size INTEGER DEFAULT 1,
      container_slots INTEGER DEFAULT 0
    );

    -- Accounts
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT,
      is_admin INTEGER DEFAULT 0,
      parental_controls TEXT DEFAULT '{}',
      blocked INTEGER DEFAULT 0,
      blocked_reason TEXT
    );

    -- Invites (token-based email invites)
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT REFERENCES characters(id),
      created_at TEXT DEFAULT (datetime('now')),
      accepted INTEGER DEFAULT 0
    );

    -- Characters
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      name TEXT UNIQUE NOT NULL,
      background TEXT DEFAULT 'deckhand',
      room_id TEXT REFERENCES rooms(id),
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      strength INTEGER DEFAULT 10,
      agility INTEGER DEFAULT 10,
      endurance INTEGER DEFAULT 10,
      intellect INTEGER DEFAULT 10,
      perception INTEGER DEFAULT 10,
      presence INTEGER DEFAULT 10,
      willpower INTEGER DEFAULT 10,
      health INTEGER DEFAULT 100,
      health_max INTEGER DEFAULT 100,
      stamina INTEGER DEFAULT 100,
      stamina_max INTEGER DEFAULT 100,
      focus INTEGER DEFAULT 50,
      focus_max INTEGER DEFAULT 50,
      currency_copper INTEGER DEFAULT 50,
      currency_silver INTEGER DEFAULT 5,
      currency_gold INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_active TEXT,
      title TEXT,
      guild_id TEXT,
      flags TEXT DEFAULT '[]',
      personality_tags TEXT DEFAULT '[]'
    );

    -- Character inventory (item instances)
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id),
      item_id TEXT NOT NULL REFERENCES items(id),
      quantity INTEGER DEFAULT 1,
      durability INTEGER DEFAULT 100,
      equipped INTEGER DEFAULT 0,
      equipped_slot TEXT,
      container_id TEXT,
      properties TEXT DEFAULT '{}'
    );

    -- Items on the ground in a room (dropped or placed)
    CREATE TABLE IF NOT EXISTS room_items (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      item_id TEXT NOT NULL REFERENCES items(id),
      quantity INTEGER DEFAULT 1
    );

    -- Skill definitions (id is GUID; skill_key is optional stable key for lookups e.g. starter skills)
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      skill_key TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      max_level INTEGER DEFAULT 100
    );

    -- Character skills
    CREATE TABLE IF NOT EXISTS character_skills (
      character_id TEXT NOT NULL REFERENCES characters(id),
      skill_id TEXT NOT NULL REFERENCES skills(id),
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      PRIMARY KEY (character_id, skill_id)
    );

    -- NPCs
    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(id),
      home_region TEXT,
      description TEXT,
      personality_traits TEXT DEFAULT '[]',
      speech_style TEXT,
      backstory TEXT,
      faction_affiliation TEXT,
      quest_links TEXT DEFAULT '[]',
      shop_inventory TEXT DEFAULT '[]',
      dialogue_tree TEXT DEFAULT '{}',
      ai_prompt_base TEXT,
      ai_safety_rules TEXT,
      knowledge_tags TEXT DEFAULT '[]',
      schedule TEXT DEFAULT '{}',
      response_boundaries TEXT DEFAULT '[]'
    );

    -- Creatures (spawn templates)
    CREATE TABLE IF NOT EXISTS creatures (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      level INTEGER DEFAULT 1,
      health_max INTEGER DEFAULT 20,
      attack_min INTEGER DEFAULT 2,
      attack_max INTEGER DEFAULT 6,
      defense INTEGER DEFAULT 1,
      accuracy INTEGER DEFAULT 60,
      dodge INTEGER DEFAULT 10,
      attack_speed REAL DEFAULT 3.0,
      behavior TEXT DEFAULT 'aggressive',
      loot_table TEXT DEFAULT '[]',
      experience_reward INTEGER DEFAULT 10,
      habitat_tags TEXT DEFAULT '[]',
      ambient_actions TEXT DEFAULT '[]'
    );

    -- Spawn tables
    CREATE TABLE IF NOT EXISTS spawn_tables (
      id TEXT PRIMARY KEY,
      entries TEXT NOT NULL DEFAULT '[]',
      max_concurrent INTEGER DEFAULT 3,
      respawn_seconds INTEGER DEFAULT 120
    );

    -- Quests
    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      quest_giver_npc_id TEXT,
      prerequisites TEXT DEFAULT '[]',
      objectives TEXT NOT NULL DEFAULT '[]',
      rewards TEXT DEFAULT '{}',
      repeatable INTEGER DEFAULT 0,
      level_requirement INTEGER DEFAULT 1,
      category TEXT DEFAULT 'errand'
    );

    -- Character quest state
    CREATE TABLE IF NOT EXISTS character_quests (
      character_id TEXT NOT NULL REFERENCES characters(id),
      quest_id TEXT NOT NULL REFERENCES quests(id),
      state TEXT DEFAULT 'available',
      progress TEXT DEFAULT '{}',
      started_at TEXT,
      completed_at TEXT,
      PRIMARY KEY (character_id, quest_id)
    );

    -- Crafting recipes
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT REFERENCES skills(id),
      skill_level_required INTEGER DEFAULT 1,
      ingredients TEXT NOT NULL DEFAULT '[]',
      output_item_id TEXT REFERENCES items(id),
      output_quantity INTEGER DEFAULT 1,
      success_base_chance REAL DEFAULT 0.8,
      crafting_time_seconds INTEGER DEFAULT 5,
      required_station TEXT
    );

    -- Guilds
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      leader_id TEXT REFERENCES characters(id),
      created_at TEXT DEFAULT (datetime('now')),
      tags TEXT DEFAULT '[]'
    );

    -- Chat log (recent, pruned periodically)
    CREATE TABLE IF NOT EXISTS chat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      character_id TEXT,
      character_name TEXT,
      message TEXT NOT NULL,
      room_id TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- World events
    CREATE TABLE IF NOT EXISTS world_events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      event_type TEXT DEFAULT 'announcement',
      trigger_conditions TEXT DEFAULT '{}',
      effects TEXT DEFAULT '{}',
      active INTEGER DEFAULT 0,
      start_time TEXT,
      end_time TEXT
    );

    -- Player reports
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_character_id TEXT NOT NULL REFERENCES characters(id),
      target_account_id TEXT NOT NULL REFERENCES accounts(id),
      target_character_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      admin_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    -- Admin settings (key-value store)
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Admin audit log
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_account_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_rooms_region ON rooms(region_id);
    CREATE INDEX IF NOT EXISTS idx_exits_from ON exits(from_room_id);
    CREATE INDEX IF NOT EXISTS idx_exits_to ON exits(to_room_id);
    CREATE INDEX IF NOT EXISTS idx_gates_from ON gates(from_room_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_char ON inventory(character_id);
    CREATE INDEX IF NOT EXISTS idx_room_items_room ON room_items(room_id);
    CREATE INDEX IF NOT EXISTS idx_npcs_room ON npcs(room_id);
    CREATE INDEX IF NOT EXISTS idx_char_skills ON character_skills(character_id);
    CREATE INDEX IF NOT EXISTS idx_char_quests ON character_quests(character_id);
    CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_log(channel, timestamp);
  `);

  // Migration: rename username -> email on accounts (for existing DBs)
  try {
    const cols = db.prepare("PRAGMA table_info(accounts)").all() as any[];
    if (cols.some((c: any) => c.name === 'username') && !cols.some((c: any) => c.name === 'email')) {
      db.exec('ALTER TABLE accounts RENAME COLUMN username TO email');
      console.log('[db] Migrated accounts.username -> accounts.email');
    }
  } catch (_) {}

  // Migration: add blocked column to accounts
  try { db.exec('ALTER TABLE accounts ADD COLUMN blocked INTEGER DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE accounts ADD COLUMN blocked_reason TEXT'); } catch (_) {}

  // Migration: add item_key / skill_key for existing DBs (no-op if columns already exist)
  try { db.exec('ALTER TABLE items ADD COLUMN item_key TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE skills ADD COLUMN skill_key TEXT'); } catch (_) {}

  // Migration: add size and container_slots to items
  try { db.exec('ALTER TABLE items ADD COLUMN size INTEGER DEFAULT 1'); } catch (_) {}
  try { db.exec('ALTER TABLE items ADD COLUMN container_slots INTEGER DEFAULT 0'); } catch (_) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_items_item_key ON items(item_key) WHERE item_key IS NOT NULL'); } catch (_) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_skill_key ON skills(skill_key) WHERE skill_key IS NOT NULL'); } catch (_) {}

  // Ensure all characters have a valid room_id (null or missing room -> default start room)
  const startTagged = db.prepare("SELECT id FROM rooms WHERE room_tags LIKE ? LIMIT 1").get('%"start"%') as { id: string } | undefined;
  const safeRoom = db.prepare('SELECT id FROM rooms WHERE safe_zone = 1 LIMIT 1').get() as { id: string } | undefined;
  const firstRoom = db.prepare('SELECT id FROM rooms LIMIT 1').get() as { id: string } | undefined;
  const defaultRoomId = startTagged?.id ?? safeRoom?.id ?? firstRoom?.id;
  if (defaultRoomId) {
    const updated = db.prepare(`
      UPDATE characters SET room_id = ? WHERE room_id IS NULL OR room_id NOT IN (SELECT id FROM rooms)
    `).run(defaultRoomId);
    if (updated.changes > 0) {
      console.log(`[db] Fixed ${updated.changes} character(s) with invalid room_id -> ${defaultRoomId}`);
    }
  }
}

export default db;

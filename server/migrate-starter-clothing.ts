/**
 * One-time migration: ensure every character has the default starter clothing
 * (plain cotton shirt, brown leather pants, canvas sack, brown leather boots).
 * Run with: npx tsx server/migrate-starter-clothing.ts
 */
import db, { initDatabase } from './db';
import { v4 as uuid } from 'uuid';

initDatabase();

const starterClothing = [
  { item_key: 'cotton_shirt', name: 'Plain cotton shirt', description: 'A simple white cotton shirt.', category: 'armor', slot: 'torso', weight: 0.5, value: 5, properties: '{"armor":1}', tags: '["cloth","starter"]' },
  { item_key: 'brown_leather_pants', name: 'Brown leather pants', description: 'Sturdy brown leather pants.', category: 'armor', slot: 'legs', weight: 1.0, value: 15, properties: '{"armor":1}', tags: '["leather","starter"]' },
  { item_key: 'canvas_sack', name: 'Canvas sack', description: 'A simple canvas sack for carrying belongings.', category: 'misc', slot: 'back', weight: 0.5, value: 3, properties: '{}', tags: '["container","starter"]' },
  { item_key: 'brown_leather_boots', name: 'Brown leather boots', description: 'Brown leather boots, well worn but serviceable.', category: 'armor', slot: 'feet', weight: 1.5, value: 18, properties: '{"armor":1}', tags: '["leather","starter"]' },
];

console.log('Migrating starter clothing...');

for (const row of starterClothing) {
  const existing = db.prepare('SELECT id, slot FROM items WHERE item_key = ?').get(row.item_key) as any;
  if (!existing) {
    const itemId = uuid();
    db.prepare(`INSERT INTO items (id, item_key, name, description, category, slot, weight, value, properties, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(itemId, row.item_key, row.name, row.description, row.category, row.slot, row.weight, row.value, row.properties, row.tags);
    console.log(`  Added item: ${row.name}`);
  }
}

const characters = db.prepare('SELECT id FROM characters').all() as { id: string }[];
let granted = 0;

for (const char of characters) {
  for (const row of starterClothing) {
    const item = db.prepare('SELECT id, slot FROM items WHERE item_key = ?').get(row.item_key) as any;
    if (!item?.slot) continue;
    const has = db.prepare('SELECT id FROM inventory WHERE character_id = ? AND item_id = ?').get(char.id, item.id);
    if (has) continue;
    db.prepare('UPDATE inventory SET equipped = 0, equipped_slot = NULL WHERE character_id = ? AND equipped_slot = ?').run(char.id, item.slot);
    db.prepare('INSERT INTO inventory (id, character_id, item_id, equipped, equipped_slot) VALUES (?, ?, ?, 1, ?)')
      .run(uuid(), char.id, item.id, item.slot);
    granted++;
  }
}

console.log(`Granted ${granted} starter clothing item(s) to ${characters.length} character(s).`);
console.log('Done.');

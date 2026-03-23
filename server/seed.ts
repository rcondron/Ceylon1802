import db, { initDatabase } from './db';
import { v4 as uuid } from 'uuid';

initDatabase();
// Seed runs with FK off so INSERT OR REPLACE (regions/rooms/items etc.) does not conflict with existing refs; server uses FK on.
db.pragma('foreign_keys = OFF');

console.log('Seeding Ceylon 1802 world data...');

// Purge all world-definition tables so re-seed is clean (player data is preserved)
db.prepare('DELETE FROM gates').run();
db.prepare('DELETE FROM exits').run();
db.prepare('DELETE FROM room_items').run();
db.prepare('DELETE FROM spawn_tables').run();
db.prepare('DELETE FROM npcs').run();
db.prepare('DELETE FROM quests').run();
db.prepare('DELETE FROM creatures').run();
db.prepare('DELETE FROM rooms').run();
db.prepare('DELETE FROM regions').run();
db.prepare('DELETE FROM items').run();
db.prepare('DELETE FROM skills').run();

// All entity IDs are GUIDs. Maps use logical keys for readability and cross-reference in seed.
const regions = { colombo_harbor: uuid(), port_market: uuid(), forge_of_kumara: uuid(), anand_outfitters: uuid(), boarding_quarter: uuid(), rusty_anchor_tavern: uuid(), sleeping_crane_inn: uuid(), jungle_edge: uuid(), fishing_coast: uuid(), cinnamon_grove: uuid() };
const rooms = { harbor_dock: uuid(), harbor_yard: uuid(), harbor_warehouse: uuid(), harbor_back_alley: uuid(), market_square: uuid(), outfitter_shop: uuid(), smithy: uuid(), forge_back: uuid(), outfitter_back: uuid(), tavern_main: uuid(), inn_lobby: uuid(), boarding_street: uuid(), town_gate: uuid(), jungle_trail_1: uuid(), jungle_trail_2: uuid(), jungle_clearing: uuid(), jungle_deep: uuid(), fishing_beach: uuid(), rocky_shore: uuid(), grove_entrance: uuid(), grove_deep: uuid() };
const items: Record<string, string> = {};
const creatures = { dock_rat: uuid(), jungle_boar: uuid(), green_snake: uuid(), wild_monkey: uuid(), feral_dog: uuid(), coastal_crab: uuid() };
const spawnTables = { harbor_rats: uuid(), jungle_wildlife: uuid(), outskirts_dogs: uuid(), coastal_crabs: uuid() };
const skills: Record<string, string> = {};
const npcs = { dock_foreman: uuid(), ravi: uuid(), anand: uuid(), kumara: uuid(), mag: uuid(), mrs_perera: uuid() };
const quests = { quest_dock_rats: uuid(), quest_herb_gather: uuid() };
['worn_cutlass','small_knife','quill_knife','walking_stick','hatchet','iron_cutlass','fishing_spear','cotton_shirt','cotton_robe','leather_vest','straw_hat','leather_boots','hardened_vest','brown_leather_pants','canvas_sack','brown_leather_boots','bread_loaf','dried_fish','coconut','rice_ball','spiced_curry','mango','cinnamon_bark','wild_herbs','jungle_vine','rough_timber','iron_ore','copper_nugget','small_fish','reef_fish','large_grouper','fishing_line','pickaxe','bandage','herbal_tonic','ledger_book','rat_tail','boar_hide','boar_meat','snake_fang','monkey_paw'].forEach(k => { items[k] = uuid(); });
['blades','clubs','unarmed','defense','dodge_skill','tactics','archery','foraging','fishing','mining','woodcutting','farming','cooking','smithing','tailoring','carpentry','alchemy','bartering','medicine','navigation','stealth','lore'].forEach(k => { skills[k] = uuid(); });

const insertRegion = db.prepare('INSERT OR REPLACE INTO regions (id, name, description, level_range_min, level_range_max) VALUES (?, ?, ?, ?, ?)');
const insertRoom = db.prepare(`INSERT OR REPLACE INTO rooms (id, region_id, title, description_long, description_short, terrain_type, safe_zone, light_level, weather_exposure, ambient_text_pool, interactable_objects, room_tags, resource_nodes, spawn_table_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertExit = db.prepare('INSERT OR REPLACE INTO exits (from_room_id, to_room_id, direction, description) VALUES (?, ?, ?, ?)');
const insertGate = db.prepare('INSERT INTO gates (from_room_id, to_room_id, keywords, description) VALUES (?, ?, ?, ?)');
const insertItem = db.prepare(`INSERT OR REPLACE INTO items (id, item_key, name, description, category, slot, weight, value, rarity, stackable, max_stack, properties, tags, size, container_slots) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertNpc = db.prepare(`INSERT OR REPLACE INTO npcs (id, name, role, room_id, home_region, description, personality_traits, speech_style, dialogue_tree, shop_inventory, quest_links, ai_prompt_base, knowledge_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertCreature = db.prepare(`INSERT OR REPLACE INTO creatures (id, name, description, level, health_max, attack_min, attack_max, defense, accuracy, dodge, attack_speed, behavior, loot_table, experience_reward, habitat_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertSkill = db.prepare('INSERT OR REPLACE INTO skills (id, skill_key, name, category, description) VALUES (?, ?, ?, ?, ?)');
const insertQuest = db.prepare(`INSERT OR REPLACE INTO quests (id, name, description, quest_giver_npc_id, objectives, rewards, level_requirement, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const insertSpawnTable = db.prepare('INSERT OR REPLACE INTO spawn_tables (id, entries, max_concurrent, respawn_seconds) VALUES (?, ?, ?, ?)');

// ==================== REGIONS ====================
insertRegion.run(regions.colombo_harbor, 'Colombo Harbor', 'The bustling port of Colombo, where ships from across the world dock amid the smell of cinnamon, salt, and tar.', 1, 3);
insertRegion.run(regions.port_market, 'Port Market District', 'The commercial heart of the harbor quarter. Merchants, traders, and hawkers fill the narrow streets.', 1, 3);
insertRegion.run(regions.forge_of_kumara, 'Forge of Kumara', 'Kumara\'s smithy — a working forge where weapons and tools are made.', 1, 3);
insertRegion.run(regions.anand_outfitters, 'Anand\'s Outfitters', 'A well-stocked outfitter\'s shop for travelers and adventurers.', 1, 3);
insertRegion.run(regions.boarding_quarter, 'Boarding Quarter', 'A dusty street lined with boarding houses, taverns, and laundry lines.', 1, 2);
insertRegion.run(regions.rusty_anchor_tavern, 'The Rusty Anchor', 'A warm, loud tavern popular with sailors and traders.', 1, 2);
insertRegion.run(regions.sleeping_crane_inn, 'The Sleeping Crane', 'A modest but clean boarding house run by Mrs. Perera.', 1, 2);
insertRegion.run(regions.jungle_edge, 'Jungle Edge', 'Where the port town gives way to dense tropical jungle. Trails wind through towering palms and tangled undergrowth.', 2, 5);
insertRegion.run(regions.fishing_coast, 'Fishing Coast', 'A stretch of rocky coastline south of the harbor, dotted with fishing huts and tide pools.', 2, 4);
insertRegion.run(regions.cinnamon_grove, 'Cinnamon Grove', 'Fragrant cinnamon plantations stretch inland, worked by laborers under the colonial sun.', 3, 5);

// ==================== SKILLS ====================
insertSkill.run(skills.blades, 'blades', 'Blades', 'Combat', 'Skill with swords, cutlasses, and bladed weapons');
insertSkill.run(skills.clubs, 'clubs', 'Clubs', 'Combat', 'Skill with blunt weapons and staves');
insertSkill.run(skills.unarmed, 'unarmed', 'Unarmed', 'Combat', 'Bare-fisted fighting');
insertSkill.run(skills.defense, 'defense', 'Defense', 'Combat', 'Blocking and parrying attacks');
insertSkill.run(skills.dodge_skill, 'dodge_skill', 'Dodge', 'Combat', 'Evading attacks');
insertSkill.run(skills.tactics, 'tactics', 'Tactics', 'Combat', 'Combat strategy and positioning');
insertSkill.run(skills.archery, 'archery', 'Archery', 'Combat', 'Skill with bows and thrown weapons');
insertSkill.run(skills.foraging, 'foraging', 'Foraging', 'Survival', 'Finding herbs, fruits, and natural materials');
insertSkill.run(skills.fishing, 'fishing', 'Fishing', 'Survival', 'Catching fish by rod, net, or trap');
insertSkill.run(skills.mining, 'mining', 'Mining', 'Survival', 'Extracting ore and stone from deposits');
insertSkill.run(skills.woodcutting, 'woodcutting', 'Woodcutting', 'Survival', 'Felling trees and gathering timber');
insertSkill.run(skills.farming, 'farming', 'Farming', 'Survival', 'Growing and harvesting crops');
insertSkill.run(skills.cooking, 'cooking', 'Cooking', 'Crafting', 'Preparing food and drink');
insertSkill.run(skills.smithing, 'smithing', 'Smithing', 'Crafting', 'Working metal into weapons and tools');
insertSkill.run(skills.tailoring, 'tailoring', 'Tailoring', 'Crafting', 'Creating clothing and cloth goods');
insertSkill.run(skills.carpentry, 'carpentry', 'Carpentry', 'Crafting', 'Building with wood');
insertSkill.run(skills.alchemy, 'alchemy', 'Alchemy', 'Crafting', 'Brewing tonics, remedies, and herbal mixtures');
insertSkill.run(skills.bartering, 'bartering', 'Bartering', 'Social', 'Negotiating better prices');
insertSkill.run(skills.medicine, 'medicine', 'Medicine', 'Social', 'Treating wounds and illness');
insertSkill.run(skills.navigation, 'navigation', 'Navigation', 'Social', 'Finding your way through unknown terrain');
insertSkill.run(skills.stealth, 'stealth', 'Stealth', 'Social', 'Moving unseen and unheard');
insertSkill.run(skills.lore, 'lore', 'Lore', 'Social', 'Knowledge of history, legends, and customs');

// ==================== ITEMS ====================
// size = how many container slots this item occupies; also: if size > player strength, too heavy to carry
// container_slots = how many slots this item can hold (0 = not a container)

// Weapons
insertItem.run(items.worn_cutlass, 'worn_cutlass', 'Worn Cutlass', 'A battered but serviceable naval cutlass.', 'weapon', 'hand', 3.0, 25, 'common', 0, 1, JSON.stringify({ damage: 6, type: 'slash' }), '["blade","starter"]', 4, 0);
insertItem.run(items.small_knife, 'small_knife', 'Small Knife', 'A simple utility knife, sharp enough in a pinch.', 'weapon', 'hand', 0.5, 10, 'common', 0, 1, JSON.stringify({ damage: 3, type: 'pierce' }), '["blade","starter"]', 2, 0);
insertItem.run(items.quill_knife, 'quill_knife', 'Quill Knife', 'A slim letter opener, barely a weapon.', 'weapon', 'hand', 0.3, 5, 'common', 0, 1, JSON.stringify({ damage: 2, type: 'pierce' }), '["blade","starter"]', 1, 0);
insertItem.run(items.walking_stick, 'walking_stick', 'Walking Stick', 'A sturdy wooden walking stick.', 'weapon', 'hand', 2.0, 8, 'common', 0, 1, JSON.stringify({ damage: 4, type: 'blunt' }), '["club","starter"]', 3, 0);
insertItem.run(items.hatchet, 'hatchet', 'Hatchet', 'A small wood-chopping hatchet.', 'weapon', 'hand', 2.5, 20, 'common', 0, 1, JSON.stringify({ damage: 5, type: 'slash' }), '["blade","tool","starter"]', 3, 0);
insertItem.run(items.iron_cutlass, 'iron_cutlass', 'Iron Cutlass', 'A well-forged cutlass with good balance.', 'weapon', 'hand', 3.0, 80, 'uncommon', 0, 1, JSON.stringify({ damage: 10, type: 'slash' }), '["blade"]', 4, 0);
insertItem.run(items.fishing_spear, 'fishing_spear', 'Fishing Spear', 'A barbed spear used for river fishing.', 'weapon', 'hand', 3.5, 30, 'common', 0, 1, JSON.stringify({ damage: 7, type: 'pierce' }), '["polearm"]', 5, 0);

// Armor
insertItem.run(items.cotton_shirt, 'cotton_shirt', 'Plain cotton shirt', 'A simple white cotton shirt.', 'armor', 'torso', 0.5, 5, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["cloth","starter"]', 2, 0);
insertItem.run(items.cotton_robe, 'cotton_robe', 'Cotton Robe', 'A plain cotton robe.', 'armor', 'torso', 0.8, 8, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["cloth","starter"]', 3, 0);
insertItem.run(items.leather_vest, 'leather_vest', 'Leather Vest', 'A tough leather vest that offers some protection.', 'armor', 'torso', 2.0, 35, 'common', 0, 1, JSON.stringify({ armor: 3 }), '["leather"]', 3, 0);
insertItem.run(items.straw_hat, 'straw_hat', 'Straw Hat', 'A wide-brimmed straw hat, good for the sun.', 'armor', 'head', 0.3, 5, 'common', 0, 1, JSON.stringify({ armor: 0 }), '["cloth"]', 1, 0);
insertItem.run(items.leather_boots, 'leather_boots', 'Leather Boots', 'Sturdy leather boots.', 'armor', 'feet', 1.5, 20, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["leather"]', 2, 0);
insertItem.run(items.brown_leather_pants, 'brown_leather_pants', 'Brown leather pants', 'Sturdy brown leather pants.', 'armor', 'legs', 1.0, 15, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["leather","starter"]', 3, 2);
insertItem.run(items.canvas_sack, 'canvas_sack', 'Canvas sack', 'A simple canvas sack for carrying belongings.', 'armor', 'back', 0.5, 3, 'common', 0, 1, '{}', '["container","starter"]', 2, 10);
insertItem.run(items.brown_leather_boots, 'brown_leather_boots', 'Brown leather boots', 'Brown leather boots, well worn but serviceable.', 'armor', 'feet', 1.5, 18, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["leather","starter"]', 2, 0);
insertItem.run(items.hardened_vest, 'hardened_vest', 'Hardened Leather Vest', 'A leather vest reinforced with metal studs.', 'armor', 'torso', 3.5, 120, 'uncommon', 0, 1, JSON.stringify({ armor: 5 }), '["leather"]', 4, 0);

// Food
insertItem.run(items.bread_loaf, 'bread_loaf', 'Loaf of Bread', 'A dense, slightly stale loaf of bread.', 'food', null, 0.5, 3, 'common', 1, 10, JSON.stringify({ heal: 10 }), '["food","starter"]', 1, 0);
insertItem.run(items.dried_fish, 'dried_fish', 'Dried Fish', 'Salt-dried fish that keeps well.', 'food', null, 0.3, 5, 'common', 1, 10, JSON.stringify({ heal: 15 }), '["food"]', 1, 0);
insertItem.run(items.coconut, 'coconut', 'Coconut', 'A fresh coconut full of sweet water.', 'food', null, 0.8, 4, 'common', 1, 5, JSON.stringify({ heal: 12, stamina: 10 }), '["food","tropical"]', 1, 0);
insertItem.run(items.rice_ball, 'rice_ball', 'Rice Ball', 'A ball of sticky rice wrapped in a leaf.', 'food', null, 0.3, 3, 'common', 1, 10, JSON.stringify({ heal: 10 }), '["food"]', 1, 0);
insertItem.run(items.spiced_curry, 'spiced_curry', 'Spiced Curry', 'A bowl of rich, fragrant curry.', 'food', null, 0.5, 12, 'uncommon', 0, 1, JSON.stringify({ heal: 30, stamina: 20 }), '["food","cooked"]', 1, 0);
insertItem.run(items.mango, 'mango', 'Ripe Mango', 'A sweet, ripe mango.', 'food', null, 0.3, 2, 'common', 1, 10, JSON.stringify({ heal: 8 }), '["food","tropical","forage"]', 1, 0);

// Resources
insertItem.run(items.cinnamon_bark, 'cinnamon_bark', 'Cinnamon Bark', 'A curl of fragrant cinnamon bark.', 'resource', null, 0.1, 8, 'common', 1, 50, '{}', '["spice","trade","forage"]', 1, 0);
insertItem.run(items.wild_herbs, 'wild_herbs', 'Wild Herbs', 'A bundle of assorted wild herbs.', 'resource', null, 0.2, 3, 'common', 1, 50, '{}', '["herb","forage"]', 1, 0);
insertItem.run(items.jungle_vine, 'jungle_vine', 'Jungle Vine', 'A strong, flexible vine.', 'resource', null, 0.5, 2, 'common', 1, 20, '{}', '["fiber","forage"]', 1, 0);
insertItem.run(items.rough_timber, 'rough_timber', 'Rough Timber', 'An unfinished length of tropical wood.', 'resource', null, 5.0, 5, 'common', 1, 20, '{}', '["wood"]', 5, 0);
insertItem.run(items.iron_ore, 'iron_ore', 'Iron Ore', 'A chunk of raw iron ore.', 'resource', null, 4.0, 10, 'common', 1, 20, '{}', '["ore","metal"]', 4, 0);
insertItem.run(items.copper_nugget, 'copper_nugget', 'Copper Nugget', 'A small nugget of copper.', 'resource', null, 1.0, 6, 'common', 1, 20, '{}', '["ore","metal"]', 2, 0);

// Fish
insertItem.run(items.small_fish, 'small_fish', 'Small Fish', 'A small silver-scaled fish.', 'food', null, 0.5, 4, 'common', 1, 10, JSON.stringify({ heal: 8 }), '["fish","food"]', 1, 0);
insertItem.run(items.reef_fish, 'reef_fish', 'Reef Fish', 'A colorful reef fish.', 'food', null, 0.8, 8, 'common', 1, 10, JSON.stringify({ heal: 12 }), '["fish","food"]', 1, 0);
insertItem.run(items.large_grouper, 'large_grouper', 'Large Grouper', 'A heavy grouper — good eating.', 'food', null, 3.0, 20, 'uncommon', 0, 1, JSON.stringify({ heal: 25 }), '["fish","food","rare_catch"]', 3, 0);

// Tools
insertItem.run(items.fishing_line, 'fishing_line', 'Fishing Line', 'A simple line with a bone hook.', 'tool', null, 0.2, 8, 'common', 0, 1, '{}', '["tool","fishing","starter"]', 1, 0);
insertItem.run(items.pickaxe, 'pickaxe', 'Pickaxe', 'A sturdy iron pickaxe for mining.', 'tool', null, 4.0, 30, 'common', 0, 1, '{}', '["tool","mining"]', 4, 0);
insertItem.run(items.bandage, 'bandage', 'Cloth Bandage', 'A strip of clean cloth for binding wounds.', 'medicine', null, 0.1, 5, 'common', 1, 10, JSON.stringify({ heal: 20 }), '["medicine"]', 1, 0);
insertItem.run(items.herbal_tonic, 'herbal_tonic', 'Herbal Tonic', 'A bitter herbal remedy.', 'medicine', null, 0.3, 15, 'uncommon', 1, 5, JSON.stringify({ heal: 40 }), '["medicine","alchemy"]', 1, 0);
insertItem.run(items.ledger_book, 'ledger_book', 'Ledger Book', 'A leather-bound ledger for accounts.', 'misc', null, 1.0, 10, 'common', 0, 1, '{}', '["book","starter"]', 2, 0);

// Loot items
insertItem.run(items.rat_tail, 'rat_tail', 'Rat Tail', 'A greasy rat tail. Someone might buy this.', 'resource', null, 0.1, 1, 'common', 1, 50, '{}', '["loot","vermin"]', 1, 0);
insertItem.run(items.boar_hide, 'boar_hide', 'Boar Hide', 'A rough boar hide. Useful for leatherworking.', 'resource', null, 2.0, 8, 'common', 1, 10, '{}', '["loot","leather","hide"]', 3, 0);
insertItem.run(items.boar_meat, 'boar_meat', 'Boar Meat', 'A cut of wild boar meat.', 'food', null, 1.5, 6, 'common', 1, 10, JSON.stringify({ heal: 15 }), '["food","meat","loot"]', 2, 0);
insertItem.run(items.snake_fang, 'snake_fang', 'Snake Fang', 'A curved venomous fang.', 'resource', null, 0.1, 12, 'uncommon', 1, 20, '{}', '["loot","alchemy"]', 1, 0);
insertItem.run(items.monkey_paw, 'monkey_paw', 'Monkey Paw', 'A small dried monkey paw. Considered lucky by some.', 'resource', null, 0.1, 15, 'uncommon', 1, 5, '{}', '["loot","curio"]', 1, 0);

// ==================== CREATURES ====================
insertCreature.run(creatures.dock_rat, 'Dock Rat', 'A large, mangy rat that haunts the waterfront.', 1, 12, 1, 3, 0, 50, 5, 2.5, 'aggressive', JSON.stringify([{ item_id: items.rat_tail, chance: 0.6, quantity: 1 }]), 8, '["urban","harbor"]');
insertCreature.run(creatures.jungle_boar, 'Jungle Boar', 'A stocky wild boar with sharp tusks, common on jungle trails.', 2, 30, 3, 7, 2, 55, 10, 3.0, 'territorial', JSON.stringify([{ item_id: items.boar_hide, chance: 0.5 }, { item_id: items.boar_meat, chance: 0.7 }]), 20, '["jungle","forest"]');
insertCreature.run(creatures.green_snake, 'Green Snake', 'A bright green snake coiled among the undergrowth.', 2, 15, 2, 5, 0, 65, 25, 2.0, 'aggressive', JSON.stringify([{ item_id: items.snake_fang, chance: 0.4 }]), 15, '["jungle","forest"]');
insertCreature.run(creatures.wild_monkey, 'Wild Monkey', 'A quick, chattering monkey that can be surprisingly aggressive.', 1, 18, 2, 4, 0, 60, 30, 2.0, 'territorial', JSON.stringify([{ item_id: items.monkey_paw, chance: 0.2 }, { item_id: items.mango, chance: 0.5 }]), 12, '["jungle","forest"]');
insertCreature.run(creatures.feral_dog, 'Feral Dog', 'A lean, scarred stray dog baring its teeth.', 1, 20, 2, 5, 1, 55, 15, 2.5, 'aggressive', JSON.stringify([]), 10, '["urban","outskirts"]');
insertCreature.run(creatures.coastal_crab, 'Coastal Crab', 'A large crab with powerful pincers, found among the rocks.', 2, 25, 3, 6, 4, 45, 5, 3.5, 'territorial', JSON.stringify([]), 14, '["coast","water"]');

// ==================== SPAWN TABLES ====================
insertSpawnTable.run(spawnTables.harbor_rats, JSON.stringify([{ creature_id: creatures.dock_rat }]), 2, 90);
insertSpawnTable.run(spawnTables.jungle_wildlife, JSON.stringify([{ creature_id: creatures.jungle_boar }, { creature_id: creatures.green_snake }, { creature_id: creatures.wild_monkey }]), 2, 120);
insertSpawnTable.run(spawnTables.outskirts_dogs, JSON.stringify([{ creature_id: creatures.feral_dog }]), 2, 100);
insertSpawnTable.run(spawnTables.coastal_crabs, JSON.stringify([{ creature_id: creatures.coastal_crab }]), 2, 120);

// ==================== ROOMS ====================
// --- Colombo Harbor ---
insertRoom.run(rooms.harbor_dock, regions.colombo_harbor, 'Colombo Harbor — Main Dock',
  'The great timber dock stretches out into the turquoise waters of the Indian Ocean. Merchant vessels creak at their moorings, and the air is thick with salt, tar, and the sweet scent of cinnamon. Laborers heave cargo under the watchful eyes of dock officers. Gulls wheel overhead, crying sharp notes above the harbor bustle.',
  'The main dock of Colombo Harbor, busy with ships and trade.',
  'urban', 1, 'bright', 'exposed', '["A gull cries overhead.","Waves lap against the pilings.","A porter shouts for clearance."]', '[]', '["start","harbor"]', '[]', null);

insertRoom.run(rooms.harbor_yard, regions.colombo_harbor, 'Harbor Yard',
  'A broad, packed-earth yard stretches behind the docks, surrounded by warehouses and customs offices. Carts loaded with spice barrels and bolts of cloth rattle across the uneven ground. The harbor master\'s office sits at the north end, its door always open.',
  'An open yard between the docks and the warehouses.',
  'urban', 1, 'bright', 'exposed', '["A cart rattles past.","Someone argues over a shipping manifest."]', '[]', '["harbor"]', '[]', null);

insertRoom.run(rooms.harbor_warehouse, regions.colombo_harbor, 'Cinnamon Warehouse',
  'The heavy wooden doors open into a vast warehouse fragrant with cinnamon. Bales and barrels are stacked floor to ceiling. Shafts of light fall through high windows, catching motes of spice dust that drift like golden snow. Workers sort through the latest shipment, marking tallies on slate boards.',
  'A large warehouse filled with cinnamon and trade goods.',
  'urban', 1, 'dim', 'sheltered', '["The air is thick with the scent of cinnamon.","A worker coughs in the dusty air."]', '[{"name":"cinnamon bales","description":"Tall stacks of cinnamon bark wrapped in burlap, bound for European markets."}]', '["harbor","warehouse"]', '[]', null);

insertRoom.run(rooms.harbor_back_alley, regions.colombo_harbor, 'Harbor Back Alley',
  'A narrow alley runs between two warehouses, littered with broken crates and rope ends. It smells of rotting fish and damp stone. Rats scurry in the shadows. This is not a place most honest folk linger.',
  'A shadowy alley behind the harbor warehouses.',
  'urban', 0, 'dim', 'sheltered', '["Something scurries in the shadows.","A rat squeaks.","Dripping water echoes off the walls."]', '[]', '["harbor","alley"]', '[]', spawnTables.harbor_rats);

// --- Port Market ---
insertRoom.run(rooms.market_square, regions.port_market, 'Market Square',
  'The market square buzzes with life. Stalls draped in colorful awnings sell everything from fresh fish to bolts of silk. Hawkers call out prices in a dozen tongues. The smell of frying spices mingles with incense and sweat. At the center, a weathered stone fountain trickles water into a mossy basin.',
  'The central market of Colombo, alive with traders.',
  'urban', 1, 'bright', 'exposed', '["A merchant calls out his prices.","The scent of frying samosas drifts from a food stall.","A child runs past laughing."]',
  '[{"name":"stone fountain","description":"A worn stone fountain, its water brackish but cool. Coins glint at the bottom — offerings for luck."},{"name":"food stall","description":"A low wooden counter beneath a tattered awning. Iron pots bubble over a charcoal brazier, filling the air with spiced aromas. Ravi the cook tends the pots with a broad smile."}]',
  '["market","social"]', '[]', null);

insertRoom.run(rooms.outfitter_shop, regions.anand_outfitters, 'Anand\'s Outfitters',
  'Shelves of canvas packs, rope coils, lanterns, belt knives, and broad-brimmed hats fill this narrow shop. Anand, the owner, watches from behind a scarred wooden counter, always ready with advice for newcomers heading inland.',
  'A well-stocked outfitter\'s shop.',
  'urban', 1, 'bright', 'sheltered', '["Anand adjusts a display of belt knives."]', '[]', '["market","shop"]', '[]', null);

insertRoom.run(rooms.smithy, regions.forge_of_kumara, 'Forge of Kumara',
  'The ring of hammer on iron fills this open-sided smithy. Kumara, a broad-shouldered smith, works the bellows with practiced ease. Weapons, tools, and iron fittings hang from pegs along the walls. The forge glows orange-red, radiating fierce heat.',
  'A working blacksmith forge.',
  'urban', 1, 'bright', 'sheltered', '["The hammer rings against the anvil.","Sparks fly from the forge."]',
  '[{"name":"forge","description":"A roaring coal forge, its heat almost unbearable up close."},{"name":"anvil","description":"A heavy iron anvil, scarred from years of use."}]',
  '["market","shop","crafting"]', '[]', null);

insertRoom.run(rooms.forge_back, regions.forge_of_kumara, 'Forge of Kumara — Back Room',
  'A cramped back room behind the main forge. Rare ingots and a few finished pieces — a Damascus-style blade, a silver-inlaid dagger — hang in a locked cabinet. Kumara keeps his best work here for serious buyers.',
  'The smith\'s back room, where rare wares are kept.',
  'urban', 1, 'dim', 'sheltered', '["Distant hammer strokes echo from the main forge."]',
  '[{"name":"cabinet","description":"A locked cabinet displaying a Damascus blade and a silver-inlaid dagger. Only Kumara has the key."}]',
  '["shop","crafting","rare"]', '[]', null);

insertRoom.run(rooms.outfitter_back, regions.anand_outfitters, 'Anand\'s Outfitters — Back Room',
  'A cluttered back room stacked with crates and rolled canvas. Anand keeps imported goods and the odd rare item here — a fine telescope, a compass from Amsterdam — for customers who ask.',
  'The outfitter\'s storage and rare-goods room.',
  'urban', 1, 'dim', 'sheltered', '["Someone rummages through a crate in the main shop."]', '[]', '["shop","rare"]', '[]', null);

// --- Boarding Quarter ---
insertRoom.run(rooms.tavern_main, regions.rusty_anchor_tavern, 'The Rusty Anchor — Common Room',
  'The Rusty Anchor tavern is warm, loud, and welcoming. Sailors, traders, and travelers crowd rough-hewn tables, drinking arrack and swapping stories. A fiddler plays in the corner. The bar runs the length of the south wall, tended by a woman with sharp eyes and a quick laugh.',
  'The common room of the Rusty Anchor tavern.',
  'urban', 1, 'dim', 'sheltered', '["Laughter erupts from a nearby table.","The fiddler strikes up a new tune.","Someone calls for another round."]',
  '[{"name":"notice board","description":"A cork board covered in pinned notices, job postings, and faded reward flyers."}]',
  '["tavern","social","hub"]', '[]', null);

insertRoom.run(rooms.inn_lobby, regions.sleeping_crane_inn, 'The Sleeping Crane — Lobby',
  'A modest but clean boarding house with whitewashed walls and a tile floor. A desk near the entrance holds a guest ledger. Upstairs, narrow rooms offer simple beds. The innkeeper, old Mrs. Perera, keeps the place tidy and respectable.',
  'The lobby of a clean boarding house.',
  'urban', 1, 'bright', 'sheltered', '["Mrs. Perera hums while sweeping."]', '[]', '["inn","safe"]', '[]', null);

insertRoom.run(rooms.boarding_street, regions.boarding_quarter, 'Boarding Street',
  'A wide, dusty street lined with boarding houses, small taverns, and laundry lines strung between balconies. Chickens peck in the gutters. A spice merchant\'s cart sits parked at the curb, its driver dozing in the shade.',
  'The main street of the boarding quarter.',
  'urban', 1, 'bright', 'exposed', '["A rooster crows from a rooftop.","Laundry flaps in the breeze."]', '[]', '["boarding","street"]', '[]', null);

// --- Jungle Edge ---
insertRoom.run(rooms.town_gate, regions.jungle_edge, 'Town Gate',
  'A weathered wooden gate marks the edge of Colombo\'s settled streets. Beyond, the road narrows to a jungle trail. A pair of bored colonial guards lean against the posts. Vines have begun to creep over the gateposts.',
  'The gate at the edge of town.',
  'urban', 1, 'bright', 'exposed', '["A guard yawns.","Insect song rises from the jungle ahead."]', '[]', '["gate","transition"]', '[]', null);

insertRoom.run(rooms.jungle_trail_1, regions.jungle_edge, 'Jungle Trail — Overgrown Path',
  'The trail pushes through dense tropical growth. Towering palms, broad-leafed ferns, and tangled vines press in from both sides. The air is thick, hot, and fragrant with decay and flowers. Birdsong echoes from the canopy. Something rustles in the undergrowth.',
  'An overgrown trail through dense jungle.',
  'jungle', 0, 'dim', 'sheltered', '["A bird calls from high above.","Leaves rustle nearby.","A mosquito whines past your ear."]', '[]', '["jungle","trail"]',
  JSON.stringify([{ type: 'forage', items: [items.wild_herbs, items.jungle_vine, items.mango] }]), spawnTables.jungle_wildlife);

insertRoom.run(rooms.jungle_trail_2, regions.jungle_edge, 'Jungle Trail — River Bend',
  'The trail follows a shallow river that bends through the jungle floor. Smooth stones line the bank. The water is clear but tea-brown, stained by tannins from fallen leaves. The sound of flowing water is a welcome relief from the insect drone.',
  'A jungle trail following a shallow river.',
  'jungle', 0, 'bright', 'exposed', '["Water gurgles over stones.","A dragonfly hovers above the river."]', '[]', '["jungle","trail","water"]',
  JSON.stringify([{ type: 'forage', items: [items.wild_herbs, items.mango] }, { type: 'fish', items: [items.small_fish, items.reef_fish] }]), null);

insertRoom.run(rooms.jungle_clearing, regions.jungle_edge, 'Jungle Clearing',
  'A natural clearing opens in the jungle canopy, letting in bright sunlight. The grass here is cropped short — perhaps by wild boar. Old stone foundations, barely visible beneath moss and vine, hint at something that once stood here. A carved stone post leans at an angle, worn smooth by time.',
  'A sun-dappled clearing with ancient stone ruins.',
  'jungle', 0, 'bright', 'exposed', '["Sunlight warms the clearing.","A butterfly drifts across the grass."]',
  '[{"name":"carved stone","description":"An ancient stone post covered in worn carvings. The script is unfamiliar — perhaps Sinhalese script from centuries past. A sense of age and silence clings to it."}]',
  '["jungle","clearing","ruins"]',
  JSON.stringify([{ type: 'forage', items: [items.wild_herbs, items.cinnamon_bark] }]), spawnTables.jungle_wildlife);

insertRoom.run(rooms.jungle_deep, regions.jungle_edge, 'Deep Jungle',
  'The jungle closes in completely here. Massive tree trunks, draped in moss and strangler figs, block out most of the sky. The ground is soft and uneven, crossed by roots thick as a man\'s arm. Strange calls echo from the green twilight above. This is no place for the careless.',
  'Deep, untamed jungle. Dangerous.',
  'jungle', 0, 'dark', 'sheltered', '["Something heavy moves through the underbrush.","A strange bird call echoes.","The air feels close and heavy."]', '[]', '["jungle","deep","dangerous"]',
  JSON.stringify([{ type: 'forage', items: [items.wild_herbs, items.jungle_vine, items.cinnamon_bark] }]), spawnTables.jungle_wildlife);

// --- Fishing Coast ---
insertRoom.run(rooms.fishing_beach, regions.fishing_coast, 'Fishing Beach',
  'A crescent of golden sand curves south of the harbor, scattered with beached outrigger canoes and drying nets. Fishermen mend their gear in the shade of palm trees. The surf breaks gently against the shore, turning the sand dark where it laps.',
  'A sandy beach used by local fishermen.',
  'coast', 1, 'bright', 'exposed', '["Waves lap the shore.","A fisherman knots a net.","Gulls argue over scraps."]', '[]', '["coast","beach","fishing"]',
  JSON.stringify([{ type: 'fish', items: [items.small_fish, items.reef_fish, items.large_grouper] }]), null);

insertRoom.run(rooms.rocky_shore, regions.fishing_coast, 'Rocky Shore',
  'Jagged rocks jut from the coastline here, forming tide pools filled with small crabs, sea urchins, and trapped fish. The waves crash harder here, sending spray into the air. The footing is treacherous on the wet stone.',
  'A stretch of dangerous rocky coastline.',
  'coast', 0, 'bright', 'exposed', '["Waves crash against the rocks.","A crab skitters into a crevice."]', '[]', '["coast","rocky"]',
  JSON.stringify([{ type: 'fish', items: [items.small_fish, items.reef_fish] }]), spawnTables.coastal_crabs);

// --- Cinnamon Grove ---
insertRoom.run(rooms.grove_entrance, regions.cinnamon_grove, 'Cinnamon Grove — Entrance',
  'Rows of slender cinnamon trees stretch before you, their bark peeling in fragrant curls. Workers move between the rows, stripping bark with curved knives. A plantation overseer watches from the shade of a parasol. The air is heady with the warm, sweet scent of cinnamon.',
  'The entrance to the cinnamon plantations.',
  'plantation', 0, 'bright', 'exposed', '["The scent of cinnamon is overpowering.","A worker hums as she strips bark."]', '[]', '["cinnamon","plantation"]',
  JSON.stringify([{ type: 'forage', items: [items.cinnamon_bark, items.cinnamon_bark, items.wild_herbs] }]), null);

insertRoom.run(rooms.grove_deep, regions.cinnamon_grove, 'Cinnamon Grove — Deep Rows',
  'Deeper into the plantation, the rows grow less tended. Wild growth encroaches between the cultivated trees. Here the jungle threatens to reclaim the grove. Monkeys chatter in the canopy, occasionally hurling cinnamon pods at intruders.',
  'The wilder, less tended part of the cinnamon grove.',
  'plantation', 0, 'dim', 'sheltered', '["A monkey shrieks.","Cinnamon leaves rustle overhead."]', '[]', '["cinnamon","plantation","wild"]',
  JSON.stringify([{ type: 'forage', items: [items.cinnamon_bark, items.wild_herbs, items.jungle_vine] }]), spawnTables.jungle_wildlife);

// ==================== EXITS & GATES ====================

// --- Colombo Harbor (within-region cardinal exits) ---
insertExit.run(rooms.harbor_dock, rooms.harbor_yard, 'north', 'Toward the harbor yard');
insertExit.run(rooms.harbor_yard, rooms.harbor_dock, 'south', 'Back to the main dock');
insertExit.run(rooms.harbor_yard, rooms.harbor_warehouse, 'east', 'Into the cinnamon warehouse');
insertExit.run(rooms.harbor_yard, rooms.harbor_back_alley, 'west', 'Into the back alley');
insertExit.run(rooms.harbor_warehouse, rooms.harbor_yard, 'west', 'Back to the harbor yard');
insertExit.run(rooms.harbor_back_alley, rooms.harbor_yard, 'east', 'Back to the harbor yard');

// Harbor <-> other regions (gates)
insertGate.run(rooms.harbor_dock, rooms.fishing_beach, 'beach, coast, shore', 'Along the coast to the fishing beach');
insertGate.run(rooms.harbor_yard, rooms.market_square, 'market, gate, street', 'Through the gate to the market');

// --- Port Market (market_square is the only room in this region) ---
// Market <-> other regions (gates)
insertGate.run(rooms.market_square, rooms.harbor_yard, 'harbor, dock, gate', 'Back through the gate to the harbor');
insertGate.run(rooms.market_square, rooms.boarding_street, 'street, boarding, alley', 'Down the street to the boarding quarter');
insertGate.run(rooms.market_square, rooms.smithy, 'forge, door, shop, kumara', 'To the blacksmith forge');
insertGate.run(rooms.market_square, rooms.outfitter_shop, 'outfitter, door, anand', 'To the outfitter\'s shop');

// --- Ravi's Food Stall (own region, one room) ---


// --- Forge of Kumara (own region, within-region exits) ---
insertExit.run(rooms.smithy, rooms.forge_back, 'north', 'Into the back room');
insertExit.run(rooms.forge_back, rooms.smithy, 'south', 'Back to the main forge');
insertGate.run(rooms.smithy, rooms.market_square, 'door, market, back, out', 'Back to the market square');

// --- Anand's Outfitters (own region, within-region exits) ---
insertExit.run(rooms.outfitter_shop, rooms.outfitter_back, 'north', 'Into the back room');
insertExit.run(rooms.outfitter_back, rooms.outfitter_shop, 'south', 'Back to the main shop');
insertGate.run(rooms.outfitter_shop, rooms.market_square, 'door, market, back, out', 'Back to the market square');

// --- Boarding Quarter (boarding_street is the only room) ---
insertGate.run(rooms.boarding_street, rooms.market_square, 'market, street, back', 'Back to the market');
insertGate.run(rooms.boarding_street, rooms.tavern_main, 'tavern, door, anchor', 'Into the Rusty Anchor tavern');
insertGate.run(rooms.boarding_street, rooms.inn_lobby, 'inn, door, crane', 'Into the Sleeping Crane inn');
insertGate.run(rooms.boarding_street, rooms.town_gate, 'gate, road, trail', 'Toward the town gate');

// --- Rusty Anchor Tavern (own region, one room) ---
insertGate.run(rooms.tavern_main, rooms.boarding_street, 'door, street, back, out', 'Back to the boarding street');

// --- Sleeping Crane Inn (own region, one room) ---
insertGate.run(rooms.inn_lobby, rooms.boarding_street, 'door, street, back, out', 'Back to the boarding street');

// --- Jungle Edge (within-region cardinal exits) ---
insertExit.run(rooms.town_gate, rooms.jungle_trail_1, 'east', 'Into the jungle');
insertExit.run(rooms.jungle_trail_1, rooms.town_gate, 'west', 'Back to the town gate');
insertExit.run(rooms.jungle_trail_1, rooms.jungle_trail_2, 'east', 'Deeper along the trail');
insertExit.run(rooms.jungle_trail_1, rooms.jungle_clearing, 'south', 'Toward a clearing');
insertExit.run(rooms.jungle_trail_2, rooms.jungle_trail_1, 'west', 'Back along the trail');
insertExit.run(rooms.jungle_trail_2, rooms.jungle_deep, 'east', 'Into the deep jungle');
insertExit.run(rooms.jungle_clearing, rooms.jungle_trail_1, 'north', 'Back to the trail');
insertExit.run(rooms.jungle_clearing, rooms.jungle_deep, 'east', 'Into the deep jungle');
insertExit.run(rooms.jungle_deep, rooms.jungle_trail_2, 'west', 'Back to the river bend');
insertExit.run(rooms.jungle_deep, rooms.jungle_clearing, 'west', 'Toward the clearing');

// Jungle Edge <-> other regions (gates)
insertGate.run(rooms.town_gate, rooms.boarding_street, 'street, boarding, town, back', 'Back to the boarding quarter');
insertGate.run(rooms.town_gate, rooms.grove_entrance, 'grove, bridge, plantation', 'Across the bridge to the cinnamon groves');

// --- Fishing Coast (within-region cardinal exits) ---
insertExit.run(rooms.fishing_beach, rooms.rocky_shore, 'south', 'Along the rocky shore');
insertExit.run(rooms.rocky_shore, rooms.fishing_beach, 'north', 'Back to the fishing beach');

// Fishing Coast <-> other regions (gates)
insertGate.run(rooms.fishing_beach, rooms.harbor_dock, 'dock, harbor, back, path', 'Back along the coast to the harbor');

// --- Cinnamon Grove (within-region cardinal exits) ---
insertExit.run(rooms.grove_entrance, rooms.grove_deep, 'north', 'Deeper into the grove');
insertExit.run(rooms.grove_deep, rooms.grove_entrance, 'south', 'Back to the grove entrance');

// Cinnamon Grove <-> other regions (gates)
insertGate.run(rooms.grove_entrance, rooms.town_gate, 'bridge, gate, town, back', 'Across the bridge back toward town');

// ==================== NPCs ====================
insertNpc.run(npcs.dock_foreman, 'Dock Foreman Henrique', 'quest_giver', rooms.harbor_dock, regions.colombo_harbor,
  'A weathered Portuguese man with a thick mustache and sun-darkened skin. He manages the dock laborers with a booming voice and a sharp eye for trouble.',
  '["gruff","fair","experienced"]', 'direct, working-class, occasional Portuguese words',
  JSON.stringify({
    greeting: "Ah, another one off the ships, eh? Welcome to Colombo. If you want to earn your keep, I might have work for you.",
    options: [
      { keyword: "work", label: "Ask about work", response: "There's always something needs doing around the docks. Rats in the back alley have been getting bold. Clear a few out and I'll make it worth your while." },
      { keyword: "colombo", label: "Ask about Colombo", response: "Colombo's a rough port, but there's opportunity here if you're not afraid of hard work. Head to the market for supplies, the tavern for rumors." },
      { keyword: "ships", label: "Ask about ships", response: "Ships come from everywhere — Portugal, Holland, England, Arabia, China. Cinnamon goes out, goods come in. It's the heart of the island's trade." },
    ]
  }),
  '[]',
  JSON.stringify([quests.quest_dock_rats]),
  'You are Dock Foreman Henrique, a gruff but fair Portuguese dock master in 1802 Colombo, Ceylon. You manage the harbor laborers. You are practical and direct.',
  '["harbor","trade","ships","colombo"]');

insertNpc.run(npcs.ravi, 'Ravi the Cook', 'shopkeeper', rooms.market_square, regions.port_market,
  'A cheerful man with a round face and flour-dusted apron, constantly stirring pots and calling out to passersby. His food is simple but delicious.',
  '["cheerful","generous","talkative"]', 'warm, friendly, loves talking about food',
  JSON.stringify({
    greeting: "Welcome, welcome! You look hungry. Try my curry — best in Colombo! What can I get you?",
    options: [
      { keyword: "menu", label: "Ask about the menu", response: "I have rice balls, bread, dried fish, and my famous spiced curry. Everything's fresh today!" },
      { keyword: "rumors", label: "Ask about rumors", response: "I hear traders talking all day. They say something strange was found in the jungle ruins to the east. And the cinnamon prices are going up again!" },
    ]
  }),
  JSON.stringify([
    { item_id: items.bread_loaf, price: 3 },
    { item_id: items.rice_ball, price: 3 },
    { item_id: items.dried_fish, price: 5 },
    { item_id: items.spiced_curry, price: 12 },
    { item_id: items.coconut, price: 4 },
  ]),
  '[]',
  'You are Ravi, a cheerful Tamil cook who runs a food stall in the Colombo market. You love food and gossip.',
  '["food","market","rumors","colombo"]');

insertNpc.run(npcs.anand, 'Anand the Outfitter', 'shopkeeper', rooms.outfitter_shop, regions.anand_outfitters,
  'A thin, sharp-featured man with spectacles perched on his nose. He knows every item in his inventory and is always ready to equip an adventurer.',
  '["shrewd","helpful","knowledgeable"]', 'businesslike but helpful',
  JSON.stringify({
    greeting: "Need supplies? You've come to the right place. I stock everything a traveler needs.",
    options: [
      { keyword: "supplies", label: "Browse supplies", response: "I've got leather vests, boots, hats, bandages, fishing gear, and a fine iron cutlass if you can afford it." },
      { keyword: "advice", label: "Ask for advice", response: "If you're heading into the jungle, bring bandages and a good blade. And watch for boar — they're mean when startled." },
    ]
  }),
  JSON.stringify([
    { item_id: items.leather_vest, price: 35 },
    { item_id: items.leather_boots, price: 20 },
    { item_id: items.straw_hat, price: 5 },
    { item_id: items.iron_cutlass, price: 80 },
    { item_id: items.fishing_spear, price: 30 },
    { item_id: items.bandage, price: 5 },
    { item_id: items.fishing_line, price: 8 },
    { item_id: items.pickaxe, price: 30 },
  ]),
  '[]',
  'You are Anand, a shrewd Indian outfitter in Colombo who sells gear to travelers and adventurers.',
  '["gear","equipment","jungle","travel"]');

insertNpc.run(npcs.kumara, 'Kumara the Smith', 'shopkeeper', rooms.smithy, regions.forge_of_kumara,
  'A powerfully built Sinhalese man with arms like tree trunks and a gentle smile. He crafts tools and weapons with equal skill.',
  '["strong","quiet","skilled"]', 'few words, direct',
  JSON.stringify({
    greeting: "Hmm. Need something forged? I work iron, steel, copper. Tell me what you need.",
    options: [
      { keyword: "weapons", label: "Ask about weapons", response: "I have cutlasses and spears ready. For something custom, bring me materials." },
      { keyword: "crafting", label: "Ask about crafting", response: "Bring me iron ore and I can forge it into something useful. The better the ore, the better the blade." },
    ]
  }),
  JSON.stringify([
    { item_id: items.iron_cutlass, price: 80 },
    { item_id: items.fishing_spear, price: 30 },
    { item_id: items.hatchet, price: 20 },
    { item_id: items.pickaxe, price: 30 },
  ]),
  '[]',
  'You are Kumara, a quiet, strong Sinhalese blacksmith who forges tools and weapons.',
  '["smithing","weapons","tools","metal"]');

insertNpc.run(npcs.mag, 'Mag the Barkeep', 'shopkeeper', rooms.tavern_main, regions.rusty_anchor_tavern,
  'A sharp-eyed woman of mixed descent with hair pulled back in a practical bun. She runs the Rusty Anchor with a firm hand and a quick wit.',
  '["sharp","witty","worldly"]', 'quick, knowing, slightly sardonic',
  JSON.stringify({
    greeting: "New face. Welcome to the Anchor. Drink? Meal? Gossip? I've got all three.",
    options: [
      { keyword: "drink", label: "Order a drink", response: "Arrack or coconut water. The arrack's cheap and strong. The water's... wet." },
      { keyword: "gossip", label: "Ask for gossip", response: "Word is the cinnamon groves are having trouble — monkeys tearing up the young trees. And there's talk of something old found in the jungle clearings. Carved stones, they say." },
      { keyword: "rooms", label: "Ask about rooms", response: "For a bed, try the Sleeping Crane next door. Mrs. Perera keeps it clean. I just keep people fed and watered." },
    ]
  }),
  JSON.stringify([
    { item_id: items.bread_loaf, price: 3 },
    { item_id: items.dried_fish, price: 5 },
    { item_id: items.coconut, price: 4 },
  ]),
  '[]',
  'You are Mag, a sharp-witted barkeep who runs the Rusty Anchor tavern in Colombo.',
  '["tavern","gossip","rumors","social"]');

insertNpc.run(npcs.mrs_perera, 'Mrs. Perera', 'innkeeper', rooms.inn_lobby, regions.sleeping_crane_inn,
  'An elderly Sinhalese woman with silver hair and kind eyes. She runs the Sleeping Crane boarding house with quiet efficiency and genuine warmth.',
  '["kind","orderly","maternal"]', 'warm, gentle, slightly fussy',
  JSON.stringify({
    greeting: "Oh, welcome dear. You look like you could use a rest. The Sleeping Crane is a decent, quiet house. Are you looking for a room?",
    options: [
      { keyword: "room", label: "Ask about rooms", response: "A night's stay is 10 copper. Clean sheets, safe locks. I don't tolerate trouble here." },
      { keyword: "colombo", label: "Ask about the area", response: "The market is just down the street. The tavern next door gets noisy at night but Mag keeps order. Be careful if you go past the town gate — the jungle is wild." },
    ]
  }),
  '[]', '[]',
  'You are Mrs. Perera, a kind elderly Sinhalese innkeeper who runs a clean, safe boarding house.',
  '["inn","rest","boarding","safe"]');

// ==================== QUESTS ====================
insertQuest.run(quests.quest_dock_rats, 'Rat Problem', 'Dock Foreman Henrique wants someone to clear out the rats infesting the harbor back alley. Kill 3 dock rats and report back.',
  npcs.dock_foreman,
  JSON.stringify([{ type: 'kill', target: creatures.dock_rat, count: 3 }]),
  JSON.stringify({ experience: 30, copper: 25, items: [{ item_id: items.bandage, quantity: 2 }] }),
  1, 'errand');

insertQuest.run(quests.quest_herb_gather, 'Herbal Remedy', 'Gather 3 bundles of wild herbs from the jungle trails for the apothecary.',
  npcs.ravi,
  JSON.stringify([{ type: 'gather', target: items.wild_herbs, count: 3 }]),
  JSON.stringify({ experience: 25, copper: 20, items: [{ item_id: items.herbal_tonic, quantity: 1 }] }),
  1, 'gathering');

// Link quests to NPCs (already done via quest_links in NPC data)
db.prepare('UPDATE npcs SET quest_links = ? WHERE id = ?').run(JSON.stringify([quests.quest_herb_gather]), npcs.ravi);

// Give existing characters the default starter clothing if they don't have it
const starterClothingKeys = ['cotton_shirt', 'brown_leather_pants', 'canvas_sack', 'brown_leather_boots'];
const existingChars = db.prepare('SELECT id FROM characters').all() as { id: string }[];
for (const char of existingChars) {
  for (const key of starterClothingKeys) {
    const item = db.prepare('SELECT id, slot FROM items WHERE item_key = ?').get(key) as any;
    if (!item?.slot) continue;
    const has = db.prepare('SELECT id FROM inventory WHERE character_id = ? AND item_id = ?').get(char.id, item.id);
    if (has) continue;
    db.prepare('UPDATE inventory SET equipped = 0, equipped_slot = NULL WHERE character_id = ? AND equipped_slot = ?').run(char.id, item.slot);
    db.prepare('INSERT INTO inventory (id, character_id, item_id, equipped, equipped_slot) VALUES (?, ?, ?, 1, ?)')
      .run(uuid(), char.id, item.id, item.slot);
  }
}
if (existingChars.length > 0) console.log(`Granted starter clothing to ${existingChars.length} existing character(s).`);

// Create admin account
const bcrypt = require('bcryptjs');
const adminEmail = process.env.ADMIN_EMAIL || 'admin@ceylon1802.local';
const adminExists = db.prepare('SELECT id FROM accounts WHERE email = ?').get(adminEmail);
if (!adminExists) {
  const { v4: uuid } = require('uuid');
  db.prepare('INSERT INTO accounts (id, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run(uuid(), adminEmail, bcrypt.hashSync('ceylon1802', 10));
  console.log(`Admin account created — email: ${adminEmail}, password: ceylon1802`);
}

db.pragma('foreign_keys = ON'); // restore for server runtime
console.log('World seeded successfully!');
console.log(`Regions: ${(db.prepare('SELECT COUNT(*) as c FROM regions').get() as any).c}`);
console.log(`Rooms: ${(db.prepare('SELECT COUNT(*) as c FROM rooms').get() as any).c}`);
console.log(`Items: ${(db.prepare('SELECT COUNT(*) as c FROM items').get() as any).c}`);
console.log(`NPCs: ${(db.prepare('SELECT COUNT(*) as c FROM npcs').get() as any).c}`);
console.log(`Creatures: ${(db.prepare('SELECT COUNT(*) as c FROM creatures').get() as any).c}`);
console.log(`Skills: ${(db.prepare('SELECT COUNT(*) as c FROM skills').get() as any).c}`);
console.log(`Quests: ${(db.prepare('SELECT COUNT(*) as c FROM quests').get() as any).c}`);

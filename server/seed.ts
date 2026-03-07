import db, { initDatabase } from './db';

initDatabase();

console.log('Seeding Ceylon 1802 world data...');

const insertRegion = db.prepare('INSERT OR REPLACE INTO regions (id, name, description, level_range_min, level_range_max) VALUES (?, ?, ?, ?, ?)');
const insertRoom = db.prepare(`INSERT OR REPLACE INTO rooms (id, region_id, title, description_long, description_short, terrain_type, safe_zone, light_level, weather_exposure, ambient_text_pool, interactable_objects, room_tags, resource_nodes, spawn_table_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertExit = db.prepare('INSERT OR REPLACE INTO exits (from_room_id, to_room_id, direction, description) VALUES (?, ?, ?, ?)');
const insertItem = db.prepare(`INSERT OR REPLACE INTO items (id, name, description, category, slot, weight, value, rarity, stackable, max_stack, properties, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertNpc = db.prepare(`INSERT OR REPLACE INTO npcs (id, name, role, room_id, home_region, description, personality_traits, speech_style, dialogue_tree, shop_inventory, quest_links, ai_prompt_base, knowledge_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertCreature = db.prepare(`INSERT OR REPLACE INTO creatures (id, name, description, level, health_max, attack_min, attack_max, defense, accuracy, dodge, attack_speed, behavior, loot_table, experience_reward, habitat_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertSkill = db.prepare('INSERT OR REPLACE INTO skills (id, name, category, description) VALUES (?, ?, ?, ?)');
const insertQuest = db.prepare(`INSERT OR REPLACE INTO quests (id, name, description, quest_giver_npc_id, objectives, rewards, level_requirement, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const insertSpawnTable = db.prepare('INSERT OR REPLACE INTO spawn_tables (id, entries, max_concurrent, respawn_seconds) VALUES (?, ?, ?, ?)');

// ==================== REGIONS ====================
insertRegion.run('colombo_harbor', 'Colombo Harbor', 'The bustling port of Colombo, where ships from across the world dock amid the smell of cinnamon, salt, and tar.', 1, 3);
insertRegion.run('port_market', 'Port Market District', 'The commercial heart of the harbor quarter. Merchants, traders, and hawkers fill the narrow streets.', 1, 3);
insertRegion.run('boarding_quarter', 'Boarding Quarter', 'Inns, boarding houses, and taverns cater to sailors, traders, and newcomers seeking shelter.', 1, 2);
insertRegion.run('jungle_edge', 'Jungle Edge', 'Where the port town gives way to dense tropical jungle. Trails wind through towering palms and tangled undergrowth.', 2, 5);
insertRegion.run('fishing_coast', 'Fishing Coast', 'A stretch of rocky coastline south of the harbor, dotted with fishing huts and tide pools.', 2, 4);
insertRegion.run('cinnamon_grove', 'Cinnamon Grove', 'Fragrant cinnamon plantations stretch inland, worked by laborers under the colonial sun.', 3, 5);

// ==================== SKILLS ====================
insertSkill.run('blades', 'Blades', 'Combat', 'Skill with swords, cutlasses, and bladed weapons');
insertSkill.run('clubs', 'Clubs', 'Combat', 'Skill with blunt weapons and staves');
insertSkill.run('unarmed', 'Unarmed', 'Combat', 'Bare-fisted fighting');
insertSkill.run('defense', 'Defense', 'Combat', 'Blocking and parrying attacks');
insertSkill.run('dodge_skill', 'Dodge', 'Combat', 'Evading attacks');
insertSkill.run('tactics', 'Tactics', 'Combat', 'Combat strategy and positioning');
insertSkill.run('archery', 'Archery', 'Combat', 'Skill with bows and thrown weapons');
insertSkill.run('foraging', 'Foraging', 'Survival', 'Finding herbs, fruits, and natural materials');
insertSkill.run('fishing', 'Fishing', 'Survival', 'Catching fish by rod, net, or trap');
insertSkill.run('mining', 'Mining', 'Survival', 'Extracting ore and stone from deposits');
insertSkill.run('woodcutting', 'Woodcutting', 'Survival', 'Felling trees and gathering timber');
insertSkill.run('farming', 'Farming', 'Survival', 'Growing and harvesting crops');
insertSkill.run('cooking', 'Cooking', 'Crafting', 'Preparing food and drink');
insertSkill.run('smithing', 'Smithing', 'Crafting', 'Working metal into weapons and tools');
insertSkill.run('tailoring', 'Tailoring', 'Crafting', 'Creating clothing and cloth goods');
insertSkill.run('carpentry', 'Carpentry', 'Crafting', 'Building with wood');
insertSkill.run('alchemy', 'Alchemy', 'Crafting', 'Brewing tonics, remedies, and herbal mixtures');
insertSkill.run('bartering', 'Bartering', 'Social', 'Negotiating better prices');
insertSkill.run('medicine', 'Medicine', 'Social', 'Treating wounds and illness');
insertSkill.run('navigation', 'Navigation', 'Social', 'Finding your way through unknown terrain');
insertSkill.run('stealth', 'Stealth', 'Social', 'Moving unseen and unheard');
insertSkill.run('lore', 'Lore', 'Social', 'Knowledge of history, legends, and customs');

// ==================== ITEMS ====================
// Weapons
insertItem.run('worn_cutlass', 'Worn Cutlass', 'A battered but serviceable naval cutlass.', 'weapon', 'main_hand', 3.0, 25, 'common', 0, 1, JSON.stringify({ damage: 6, type: 'slash' }), '["blade","starter"]');
insertItem.run('small_knife', 'Small Knife', 'A simple utility knife, sharp enough in a pinch.', 'weapon', 'main_hand', 0.5, 10, 'common', 0, 1, JSON.stringify({ damage: 3, type: 'pierce' }), '["blade","starter"]');
insertItem.run('quill_knife', 'Quill Knife', 'A slim letter opener, barely a weapon.', 'weapon', 'main_hand', 0.3, 5, 'common', 0, 1, JSON.stringify({ damage: 2, type: 'pierce' }), '["blade","starter"]');
insertItem.run('walking_stick', 'Walking Stick', 'A sturdy wooden walking stick.', 'weapon', 'main_hand', 2.0, 8, 'common', 0, 1, JSON.stringify({ damage: 4, type: 'blunt' }), '["club","starter"]');
insertItem.run('hatchet', 'Hatchet', 'A small wood-chopping hatchet.', 'weapon', 'main_hand', 2.5, 20, 'common', 0, 1, JSON.stringify({ damage: 5, type: 'slash' }), '["blade","tool","starter"]');
insertItem.run('iron_cutlass', 'Iron Cutlass', 'A well-forged cutlass with good balance.', 'weapon', 'main_hand', 3.0, 80, 'uncommon', 0, 1, JSON.stringify({ damage: 10, type: 'slash' }), '["blade"]');
insertItem.run('fishing_spear', 'Fishing Spear', 'A barbed spear used for river fishing.', 'weapon', 'main_hand', 3.5, 30, 'common', 0, 1, JSON.stringify({ damage: 7, type: 'pierce' }), '["polearm"]');

// Armor
insertItem.run('cotton_shirt', 'Cotton Shirt', 'A simple white cotton shirt.', 'armor', 'torso', 0.5, 5, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["cloth","starter"]');
insertItem.run('cotton_robe', 'Cotton Robe', 'A plain cotton robe.', 'armor', 'torso', 0.8, 8, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["cloth","starter"]');
insertItem.run('leather_vest', 'Leather Vest', 'A tough leather vest that offers some protection.', 'armor', 'torso', 2.0, 35, 'common', 0, 1, JSON.stringify({ armor: 3 }), '["leather"]');
insertItem.run('straw_hat', 'Straw Hat', 'A wide-brimmed straw hat, good for the sun.', 'armor', 'head', 0.3, 5, 'common', 0, 1, JSON.stringify({ armor: 0 }), '["cloth"]');
insertItem.run('leather_boots', 'Leather Boots', 'Sturdy leather boots.', 'armor', 'feet', 1.5, 20, 'common', 0, 1, JSON.stringify({ armor: 1 }), '["leather"]');
insertItem.run('hardened_vest', 'Hardened Leather Vest', 'A leather vest reinforced with metal studs.', 'armor', 'torso', 3.5, 120, 'uncommon', 0, 1, JSON.stringify({ armor: 5 }), '["leather"]');

// Food
insertItem.run('bread_loaf', 'Loaf of Bread', 'A dense, slightly stale loaf of bread.', 'food', null, 0.5, 3, 'common', 1, 10, JSON.stringify({ heal: 10 }), '["food","starter"]');
insertItem.run('dried_fish', 'Dried Fish', 'Salt-dried fish that keeps well.', 'food', null, 0.3, 5, 'common', 1, 10, JSON.stringify({ heal: 15 }), '["food"]');
insertItem.run('coconut', 'Coconut', 'A fresh coconut full of sweet water.', 'food', null, 0.8, 4, 'common', 1, 5, JSON.stringify({ heal: 12, stamina: 10 }), '["food","tropical"]');
insertItem.run('rice_ball', 'Rice Ball', 'A ball of sticky rice wrapped in a leaf.', 'food', null, 0.3, 3, 'common', 1, 10, JSON.stringify({ heal: 10 }), '["food"]');
insertItem.run('spiced_curry', 'Spiced Curry', 'A bowl of rich, fragrant curry.', 'food', null, 0.5, 12, 'uncommon', 0, 1, JSON.stringify({ heal: 30, stamina: 20 }), '["food","cooked"]');
insertItem.run('mango', 'Ripe Mango', 'A sweet, ripe mango.', 'food', null, 0.3, 2, 'common', 1, 10, JSON.stringify({ heal: 8 }), '["food","tropical","forage"]');

// Resources
insertItem.run('cinnamon_bark', 'Cinnamon Bark', 'A curl of fragrant cinnamon bark.', 'resource', null, 0.1, 8, 'common', 1, 50, '{}', '["spice","trade","forage"]');
insertItem.run('wild_herbs', 'Wild Herbs', 'A bundle of assorted wild herbs.', 'resource', null, 0.2, 3, 'common', 1, 50, '{}', '["herb","forage"]');
insertItem.run('jungle_vine', 'Jungle Vine', 'A strong, flexible vine.', 'resource', null, 0.5, 2, 'common', 1, 20, '{}', '["fiber","forage"]');
insertItem.run('rough_timber', 'Rough Timber', 'An unfinished length of tropical wood.', 'resource', null, 5.0, 5, 'common', 1, 20, '{}', '["wood"]');
insertItem.run('iron_ore', 'Iron Ore', 'A chunk of raw iron ore.', 'resource', null, 4.0, 10, 'common', 1, 20, '{}', '["ore","metal"]');
insertItem.run('copper_nugget', 'Copper Nugget', 'A small nugget of copper.', 'resource', null, 1.0, 6, 'common', 1, 20, '{}', '["ore","metal"]');

// Fish
insertItem.run('small_fish', 'Small Fish', 'A small silver-scaled fish.', 'food', null, 0.5, 4, 'common', 1, 10, JSON.stringify({ heal: 8 }), '["fish","food"]');
insertItem.run('reef_fish', 'Reef Fish', 'A colorful reef fish.', 'food', null, 0.8, 8, 'common', 1, 10, JSON.stringify({ heal: 12 }), '["fish","food"]');
insertItem.run('large_grouper', 'Large Grouper', 'A heavy grouper — good eating.', 'food', null, 3.0, 20, 'uncommon', 0, 1, JSON.stringify({ heal: 25 }), '["fish","food","rare_catch"]');

// Tools
insertItem.run('fishing_line', 'Fishing Line', 'A simple line with a bone hook.', 'tool', null, 0.2, 8, 'common', 0, 1, '{}', '["tool","fishing","starter"]');
insertItem.run('pickaxe', 'Pickaxe', 'A sturdy iron pickaxe for mining.', 'tool', null, 4.0, 30, 'common', 0, 1, '{}', '["tool","mining"]');
insertItem.run('bandage', 'Cloth Bandage', 'A strip of clean cloth for binding wounds.', 'medicine', null, 0.1, 5, 'common', 1, 10, JSON.stringify({ heal: 20 }), '["medicine"]');
insertItem.run('herbal_tonic', 'Herbal Tonic', 'A bitter herbal remedy.', 'medicine', null, 0.3, 15, 'uncommon', 1, 5, JSON.stringify({ heal: 40 }), '["medicine","alchemy"]');
insertItem.run('ledger_book', 'Ledger Book', 'A leather-bound ledger for accounts.', 'misc', null, 1.0, 10, 'common', 0, 1, '{}', '["book","starter"]');

// Loot items
insertItem.run('rat_tail', 'Rat Tail', 'A greasy rat tail. Someone might buy this.', 'resource', null, 0.1, 1, 'common', 1, 50, '{}', '["loot","vermin"]');
insertItem.run('boar_hide', 'Boar Hide', 'A rough boar hide. Useful for leatherworking.', 'resource', null, 2.0, 8, 'common', 1, 10, '{}', '["loot","leather","hide"]');
insertItem.run('boar_meat', 'Boar Meat', 'A cut of wild boar meat.', 'food', null, 1.5, 6, 'common', 1, 10, JSON.stringify({ heal: 15 }), '["food","meat","loot"]');
insertItem.run('snake_fang', 'Snake Fang', 'A curved venomous fang.', 'resource', null, 0.1, 12, 'uncommon', 1, 20, '{}', '["loot","alchemy"]');
insertItem.run('monkey_paw', 'Monkey Paw', 'A small dried monkey paw. Considered lucky by some.', 'resource', null, 0.1, 15, 'uncommon', 1, 5, '{}', '["loot","curio"]');

// ==================== CREATURES ====================
insertCreature.run('dock_rat', 'Dock Rat', 'A large, mangy rat that haunts the waterfront.', 1, 12, 1, 3, 0, 50, 5, 2.5, 'aggressive', JSON.stringify([{ item_id: 'rat_tail', chance: 0.6, quantity: 1 }]), 8, '["urban","harbor"]');
insertCreature.run('jungle_boar', 'Jungle Boar', 'A stocky wild boar with sharp tusks, common on jungle trails.', 2, 30, 3, 7, 2, 55, 10, 3.0, 'territorial', JSON.stringify([{ item_id: 'boar_hide', chance: 0.5 }, { item_id: 'boar_meat', chance: 0.7 }]), 20, '["jungle","forest"]');
insertCreature.run('green_snake', 'Green Snake', 'A bright green snake coiled among the undergrowth.', 2, 15, 2, 5, 0, 65, 25, 2.0, 'aggressive', JSON.stringify([{ item_id: 'snake_fang', chance: 0.4 }]), 15, '["jungle","forest"]');
insertCreature.run('wild_monkey', 'Wild Monkey', 'A quick, chattering monkey that can be surprisingly aggressive.', 1, 18, 2, 4, 0, 60, 30, 2.0, 'territorial', JSON.stringify([{ item_id: 'monkey_paw', chance: 0.2 }, { item_id: 'mango', chance: 0.5 }]), 12, '["jungle","forest"]');
insertCreature.run('feral_dog', 'Feral Dog', 'A lean, scarred stray dog baring its teeth.', 1, 20, 2, 5, 1, 55, 15, 2.5, 'aggressive', JSON.stringify([]), 10, '["urban","outskirts"]');
insertCreature.run('coastal_crab', 'Coastal Crab', 'A large crab with powerful pincers, found among the rocks.', 2, 25, 3, 6, 4, 45, 5, 3.5, 'territorial', JSON.stringify([]), 14, '["coast","water"]');

// ==================== SPAWN TABLES ====================
insertSpawnTable.run('harbor_rats', JSON.stringify([{ creature_id: 'dock_rat' }]), 2, 90);
insertSpawnTable.run('jungle_wildlife', JSON.stringify([{ creature_id: 'jungle_boar' }, { creature_id: 'green_snake' }, { creature_id: 'wild_monkey' }]), 2, 120);
insertSpawnTable.run('outskirts_dogs', JSON.stringify([{ creature_id: 'feral_dog' }]), 2, 100);
insertSpawnTable.run('coastal_crabs', JSON.stringify([{ creature_id: 'coastal_crab' }]), 2, 120);

// ==================== ROOMS ====================
// --- Colombo Harbor ---
insertRoom.run('harbor_dock', 'colombo_harbor', 'Colombo Harbor — Main Dock',
  'The great timber dock stretches out into the turquoise waters of the Indian Ocean. Merchant vessels creak at their moorings, and the air is thick with salt, tar, and the sweet scent of cinnamon. Laborers heave cargo under the watchful eyes of dock officers. Gulls wheel overhead, crying sharp notes above the harbor bustle.',
  'The main dock of Colombo Harbor, busy with ships and trade.',
  'urban', 1, 'bright', 'exposed', '["A gull cries overhead.","Waves lap against the pilings.","A porter shouts for clearance."]', '[]', '["start","harbor"]', '[]', null);

insertRoom.run('harbor_yard', 'colombo_harbor', 'Harbor Yard',
  'A broad, packed-earth yard stretches behind the docks, surrounded by warehouses and customs offices. Carts loaded with spice barrels and bolts of cloth rattle across the uneven ground. The harbor master\'s office sits at the north end, its door always open.',
  'An open yard between the docks and the warehouses.',
  'urban', 1, 'bright', 'exposed', '["A cart rattles past.","Someone argues over a shipping manifest."]', '[]', '["harbor"]', '[]', null);

insertRoom.run('harbor_warehouse', 'colombo_harbor', 'Cinnamon Warehouse',
  'The heavy wooden doors open into a vast warehouse fragrant with cinnamon. Bales and barrels are stacked floor to ceiling. Shafts of light fall through high windows, catching motes of spice dust that drift like golden snow. Workers sort through the latest shipment, marking tallies on slate boards.',
  'A large warehouse filled with cinnamon and trade goods.',
  'urban', 1, 'dim', 'sheltered', '["The air is thick with the scent of cinnamon.","A worker coughs in the dusty air."]', '[{"name":"cinnamon bales","description":"Tall stacks of cinnamon bark wrapped in burlap, bound for European markets."}]', '["harbor","warehouse"]', '[]', null);

insertRoom.run('harbor_back_alley', 'colombo_harbor', 'Harbor Back Alley',
  'A narrow alley runs between two warehouses, littered with broken crates and rope ends. It smells of rotting fish and damp stone. Rats scurry in the shadows. This is not a place most honest folk linger.',
  'A shadowy alley behind the harbor warehouses.',
  'urban', 0, 'dim', 'sheltered', '["Something scurries in the shadows.","A rat squeaks.","Dripping water echoes off the walls."]', '[]', '["harbor","alley"]', '[]', 'harbor_rats');

// --- Port Market ---
insertRoom.run('market_square', 'port_market', 'Market Square',
  'The market square buzzes with life. Stalls draped in colorful awnings sell everything from fresh fish to bolts of silk. Hawkers call out prices in a dozen tongues. The smell of frying spices mingles with incense and sweat. At the center, a weathered stone fountain trickles water into a mossy basin.',
  'The central market of Colombo, alive with traders.',
  'urban', 1, 'bright', 'exposed', '["A merchant calls out his prices.","The scent of frying samosas drifts from a food stall.","A child runs past laughing."]',
  '[{"name":"stone fountain","description":"A worn stone fountain, its water brackish but cool. Coins glint at the bottom — offerings for luck."}]',
  '["market","social"]', '[]', null);

insertRoom.run('food_stall', 'port_market', 'Ravi\'s Food Stall',
  'A low wooden counter beneath a tattered awning, where a smiling man tends iron pots over a charcoal brazier. The aroma of spiced rice, curried lentils, and fresh flatbread fills the air. A few wooden stools are crammed close for eating.',
  'A busy food stall serving hot meals.',
  'urban', 1, 'bright', 'sheltered', '["The brazier crackles.","Steam rises from a pot of curry."]', '[]', '["market","food"]', '[]', null);

insertRoom.run('outfitter_shop', 'port_market', 'Anand\'s Outfitters',
  'Shelves of canvas packs, rope coils, lanterns, belt knives, and broad-brimmed hats fill this narrow shop. Anand, the owner, watches from behind a scarred wooden counter, always ready with advice for newcomers heading inland.',
  'A well-stocked outfitter\'s shop.',
  'urban', 1, 'bright', 'sheltered', '["Anand adjusts a display of belt knives."]', '[]', '["market","shop"]', '[]', null);

insertRoom.run('smithy', 'port_market', 'Forge of Kumara',
  'The ring of hammer on iron fills this open-sided smithy. Kumara, a broad-shouldered smith, works the bellows with practiced ease. Weapons, tools, and iron fittings hang from pegs along the walls. The forge glows orange-red, radiating fierce heat.',
  'A working blacksmith forge.',
  'urban', 1, 'bright', 'sheltered', '["The hammer rings against the anvil.","Sparks fly from the forge."]',
  '[{"name":"forge","description":"A roaring coal forge, its heat almost unbearable up close."},{"name":"anvil","description":"A heavy iron anvil, scarred from years of use."}]',
  '["market","shop","crafting"]', '[]', null);

// --- Boarding Quarter ---
insertRoom.run('tavern_main', 'boarding_quarter', 'The Rusty Anchor — Common Room',
  'The Rusty Anchor tavern is warm, loud, and welcoming. Sailors, traders, and travelers crowd rough-hewn tables, drinking arrack and swapping stories. A fiddler plays in the corner. The bar runs the length of the south wall, tended by a woman with sharp eyes and a quick laugh.',
  'The common room of the Rusty Anchor tavern.',
  'urban', 1, 'dim', 'sheltered', '["Laughter erupts from a nearby table.","The fiddler strikes up a new tune.","Someone calls for another round."]',
  '[{"name":"notice board","description":"A cork board covered in pinned notices, job postings, and faded reward flyers."}]',
  '["tavern","social","hub"]', '[]', null);

insertRoom.run('inn_lobby', 'boarding_quarter', 'The Sleeping Crane — Lobby',
  'A modest but clean boarding house with whitewashed walls and a tile floor. A desk near the entrance holds a guest ledger. Upstairs, narrow rooms offer simple beds. The innkeeper, old Mrs. Perera, keeps the place tidy and respectable.',
  'The lobby of a clean boarding house.',
  'urban', 1, 'bright', 'sheltered', '["Mrs. Perera hums while sweeping."]', '[]', '["inn","safe"]', '[]', null);

insertRoom.run('boarding_street', 'boarding_quarter', 'Boarding Street',
  'A wide, dusty street lined with boarding houses, small taverns, and laundry lines strung between balconies. Chickens peck in the gutters. A spice merchant\'s cart sits parked at the curb, its driver dozing in the shade.',
  'The main street of the boarding quarter.',
  'urban', 1, 'bright', 'exposed', '["A rooster crows from a rooftop.","Laundry flaps in the breeze."]', '[]', '["boarding","street"]', '[]', null);

// --- Jungle Edge ---
insertRoom.run('town_gate', 'jungle_edge', 'Town Gate',
  'A weathered wooden gate marks the edge of Colombo\'s settled streets. Beyond, the road narrows to a jungle trail. A pair of bored colonial guards lean against the posts. Vines have begun to creep over the gateposts.',
  'The gate at the edge of town.',
  'urban', 1, 'bright', 'exposed', '["A guard yawns.","Insect song rises from the jungle ahead."]', '[]', '["gate","transition"]', '[]', null);

insertRoom.run('jungle_trail_1', 'jungle_edge', 'Jungle Trail — Overgrown Path',
  'The trail pushes through dense tropical growth. Towering palms, broad-leafed ferns, and tangled vines press in from both sides. The air is thick, hot, and fragrant with decay and flowers. Birdsong echoes from the canopy. Something rustles in the undergrowth.',
  'An overgrown trail through dense jungle.',
  'jungle', 0, 'dim', 'sheltered', '["A bird calls from high above.","Leaves rustle nearby.","A mosquito whines past your ear."]', '[]', '["jungle","trail"]',
  JSON.stringify([{ type: 'forage', items: ['wild_herbs', 'jungle_vine', 'mango'] }]), 'jungle_wildlife');

insertRoom.run('jungle_trail_2', 'jungle_edge', 'Jungle Trail — River Bend',
  'The trail follows a shallow river that bends through the jungle floor. Smooth stones line the bank. The water is clear but tea-brown, stained by tannins from fallen leaves. The sound of flowing water is a welcome relief from the insect drone.',
  'A jungle trail following a shallow river.',
  'jungle', 0, 'bright', 'exposed', '["Water gurgles over stones.","A dragonfly hovers above the river."]', '[]', '["jungle","trail","water"]',
  JSON.stringify([{ type: 'forage', items: ['wild_herbs', 'mango'] }, { type: 'fish', items: ['small_fish', 'reef_fish'] }]), null);

insertRoom.run('jungle_clearing', 'jungle_edge', 'Jungle Clearing',
  'A natural clearing opens in the jungle canopy, letting in bright sunlight. The grass here is cropped short — perhaps by wild boar. Old stone foundations, barely visible beneath moss and vine, hint at something that once stood here. A carved stone post leans at an angle, worn smooth by time.',
  'A sun-dappled clearing with ancient stone ruins.',
  'jungle', 0, 'bright', 'exposed', '["Sunlight warms the clearing.","A butterfly drifts across the grass."]',
  '[{"name":"carved stone","description":"An ancient stone post covered in worn carvings. The script is unfamiliar — perhaps Sinhalese script from centuries past. A sense of age and silence clings to it."}]',
  '["jungle","clearing","ruins"]',
  JSON.stringify([{ type: 'forage', items: ['wild_herbs', 'cinnamon_bark'] }]), 'jungle_wildlife');

insertRoom.run('jungle_deep', 'jungle_edge', 'Deep Jungle',
  'The jungle closes in completely here. Massive tree trunks, draped in moss and strangler figs, block out most of the sky. The ground is soft and uneven, crossed by roots thick as a man\'s arm. Strange calls echo from the green twilight above. This is no place for the careless.',
  'Deep, untamed jungle. Dangerous.',
  'jungle', 0, 'dark', 'sheltered', '["Something heavy moves through the underbrush.","A strange bird call echoes.","The air feels close and heavy."]', '[]', '["jungle","deep","dangerous"]',
  JSON.stringify([{ type: 'forage', items: ['wild_herbs', 'jungle_vine', 'cinnamon_bark'] }]), 'jungle_wildlife');

// --- Fishing Coast ---
insertRoom.run('fishing_beach', 'fishing_coast', 'Fishing Beach',
  'A crescent of golden sand curves south of the harbor, scattered with beached outrigger canoes and drying nets. Fishermen mend their gear in the shade of palm trees. The surf breaks gently against the shore, turning the sand dark where it laps.',
  'A sandy beach used by local fishermen.',
  'coast', 1, 'bright', 'exposed', '["Waves lap the shore.","A fisherman knots a net.","Gulls argue over scraps."]', '[]', '["coast","beach","fishing"]',
  JSON.stringify([{ type: 'fish', items: ['small_fish', 'reef_fish', 'large_grouper'] }]), null);

insertRoom.run('rocky_shore', 'fishing_coast', 'Rocky Shore',
  'Jagged rocks jut from the coastline here, forming tide pools filled with small crabs, sea urchins, and trapped fish. The waves crash harder here, sending spray into the air. The footing is treacherous on the wet stone.',
  'A stretch of dangerous rocky coastline.',
  'coast', 0, 'bright', 'exposed', '["Waves crash against the rocks.","A crab skitters into a crevice."]', '[]', '["coast","rocky"]',
  JSON.stringify([{ type: 'fish', items: ['small_fish', 'reef_fish'] }]), 'coastal_crabs');

// --- Cinnamon Grove ---
insertRoom.run('grove_entrance', 'cinnamon_grove', 'Cinnamon Grove — Entrance',
  'Rows of slender cinnamon trees stretch before you, their bark peeling in fragrant curls. Workers move between the rows, stripping bark with curved knives. A plantation overseer watches from the shade of a parasol. The air is heady with the warm, sweet scent of cinnamon.',
  'The entrance to the cinnamon plantations.',
  'plantation', 0, 'bright', 'exposed', '["The scent of cinnamon is overpowering.","A worker hums as she strips bark."]', '[]', '["cinnamon","plantation"]',
  JSON.stringify([{ type: 'forage', items: ['cinnamon_bark', 'cinnamon_bark', 'wild_herbs'] }]), null);

insertRoom.run('grove_deep', 'cinnamon_grove', 'Cinnamon Grove — Deep Rows',
  'Deeper into the plantation, the rows grow less tended. Wild growth encroaches between the cultivated trees. Here the jungle threatens to reclaim the grove. Monkeys chatter in the canopy, occasionally hurling cinnamon pods at intruders.',
  'The wilder, less tended part of the cinnamon grove.',
  'plantation', 0, 'dim', 'sheltered', '["A monkey shrieks.","Cinnamon leaves rustle overhead."]', '[]', '["cinnamon","plantation","wild"]',
  JSON.stringify([{ type: 'forage', items: ['cinnamon_bark', 'wild_herbs', 'jungle_vine'] }]), 'jungle_wildlife');

// ==================== EXITS ====================
// Harbor
insertExit.run('harbor_dock', 'harbor_yard', 'north', 'Toward the harbor yard');
insertExit.run('harbor_dock', 'fishing_beach', 'south', 'Along the coast toward the fishing beach');

insertExit.run('harbor_yard', 'harbor_dock', 'south', 'Back to the main dock');
insertExit.run('harbor_yard', 'harbor_warehouse', 'east', 'Into the cinnamon warehouse');
insertExit.run('harbor_yard', 'harbor_back_alley', 'west', 'Into the back alley');
insertExit.run('harbor_yard', 'market_square', 'north', 'Toward the market square');

insertExit.run('harbor_warehouse', 'harbor_yard', 'west', 'Back to the harbor yard');

insertExit.run('harbor_back_alley', 'harbor_yard', 'east', 'Back to the harbor yard');

// Market
insertExit.run('market_square', 'harbor_yard', 'south', 'Back toward the harbor');
insertExit.run('market_square', 'food_stall', 'east', 'To Ravi\'s food stall');
insertExit.run('market_square', 'outfitter_shop', 'west', 'To the outfitter\'s shop');
insertExit.run('market_square', 'smithy', 'north', 'To the blacksmith forge');
insertExit.run('market_square', 'boarding_street', 'northeast', 'Toward the boarding quarter');

insertExit.run('food_stall', 'market_square', 'west', 'Back to the market square');
insertExit.run('outfitter_shop', 'market_square', 'east', 'Back to the market square');

insertExit.run('smithy', 'market_square', 'south', 'Back to the market square');
insertExit.run('smithy', 'grove_entrance', 'north', 'Toward the cinnamon groves');

// Boarding Quarter
insertExit.run('boarding_street', 'market_square', 'southwest', 'Back to the market');
insertExit.run('boarding_street', 'tavern_main', 'north', 'Into the Rusty Anchor tavern');
insertExit.run('boarding_street', 'inn_lobby', 'east', 'Into the Sleeping Crane inn');
insertExit.run('boarding_street', 'town_gate', 'northeast', 'Toward the town gate');

insertExit.run('tavern_main', 'boarding_street', 'south', 'Back to the street');
insertExit.run('inn_lobby', 'boarding_street', 'west', 'Back to the street');

// Jungle Edge
insertExit.run('town_gate', 'boarding_street', 'southwest', 'Back to the boarding quarter');
insertExit.run('town_gate', 'jungle_trail_1', 'east', 'Into the jungle');

insertExit.run('jungle_trail_1', 'town_gate', 'west', 'Back to the town gate');
insertExit.run('jungle_trail_1', 'jungle_trail_2', 'east', 'Deeper along the trail');
insertExit.run('jungle_trail_1', 'jungle_clearing', 'south', 'Toward a clearing');

insertExit.run('jungle_trail_2', 'jungle_trail_1', 'west', 'Back along the trail');
insertExit.run('jungle_trail_2', 'jungle_deep', 'east', 'Into the deep jungle');

insertExit.run('jungle_clearing', 'jungle_trail_1', 'north', 'Back to the trail');
insertExit.run('jungle_clearing', 'jungle_deep', 'east', 'Into the deep jungle');

insertExit.run('jungle_deep', 'jungle_trail_2', 'west', 'Back to the river bend');
insertExit.run('jungle_deep', 'jungle_clearing', 'west', 'Toward the clearing');

// Fishing Coast
insertExit.run('fishing_beach', 'harbor_dock', 'north', 'Back to the harbor dock');
insertExit.run('fishing_beach', 'rocky_shore', 'south', 'Along the rocky shore');

insertExit.run('rocky_shore', 'fishing_beach', 'north', 'Back to the fishing beach');

// Cinnamon Grove
insertExit.run('grove_entrance', 'smithy', 'south', 'Back toward the smithy');
insertExit.run('grove_entrance', 'grove_deep', 'north', 'Deeper into the grove');

insertExit.run('grove_deep', 'grove_entrance', 'south', 'Back to the grove entrance');

// ==================== NPCs ====================
insertNpc.run('dock_foreman', 'Dock Foreman Henrique', 'quest_giver', 'harbor_dock', 'colombo_harbor',
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
  '["quest_dock_rats"]',
  'You are Dock Foreman Henrique, a gruff but fair Portuguese dock master in 1802 Colombo, Ceylon. You manage the harbor laborers. You are practical and direct.',
  '["harbor","trade","ships","colombo"]');

insertNpc.run('ravi', 'Ravi the Cook', 'shopkeeper', 'food_stall', 'port_market',
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
    { item_id: 'bread_loaf', price: 3 },
    { item_id: 'rice_ball', price: 3 },
    { item_id: 'dried_fish', price: 5 },
    { item_id: 'spiced_curry', price: 12 },
    { item_id: 'coconut', price: 4 },
  ]),
  '[]',
  'You are Ravi, a cheerful Tamil cook who runs a food stall in the Colombo market. You love food and gossip.',
  '["food","market","rumors","colombo"]');

insertNpc.run('anand', 'Anand the Outfitter', 'shopkeeper', 'outfitter_shop', 'port_market',
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
    { item_id: 'leather_vest', price: 35 },
    { item_id: 'leather_boots', price: 20 },
    { item_id: 'straw_hat', price: 5 },
    { item_id: 'iron_cutlass', price: 80 },
    { item_id: 'fishing_spear', price: 30 },
    { item_id: 'bandage', price: 5 },
    { item_id: 'fishing_line', price: 8 },
    { item_id: 'pickaxe', price: 30 },
  ]),
  '[]',
  'You are Anand, a shrewd Indian outfitter in Colombo who sells gear to travelers and adventurers.',
  '["gear","equipment","jungle","travel"]');

insertNpc.run('kumara', 'Kumara the Smith', 'shopkeeper', 'smithy', 'port_market',
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
    { item_id: 'iron_cutlass', price: 80 },
    { item_id: 'fishing_spear', price: 30 },
    { item_id: 'hatchet', price: 20 },
    { item_id: 'pickaxe', price: 30 },
  ]),
  '[]',
  'You are Kumara, a quiet, strong Sinhalese blacksmith who forges tools and weapons.',
  '["smithing","weapons","tools","metal"]');

insertNpc.run('mag', 'Mag the Barkeep', 'shopkeeper', 'tavern_main', 'boarding_quarter',
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
    { item_id: 'bread_loaf', price: 3 },
    { item_id: 'dried_fish', price: 5 },
    { item_id: 'coconut', price: 4 },
  ]),
  '[]',
  'You are Mag, a sharp-witted barkeep who runs the Rusty Anchor tavern in Colombo.',
  '["tavern","gossip","rumors","social"]');

insertNpc.run('mrs_perera', 'Mrs. Perera', 'innkeeper', 'inn_lobby', 'boarding_quarter',
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
insertQuest.run('quest_dock_rats', 'Rat Problem', 'Dock Foreman Henrique wants someone to clear out the rats infesting the harbor back alley. Kill 3 dock rats and report back.',
  'dock_foreman',
  JSON.stringify([{ type: 'kill', target: 'dock_rat', count: 3 }]),
  JSON.stringify({ experience: 30, copper: 25, items: [{ item_id: 'bandage', quantity: 2 }] }),
  1, 'errand');

insertQuest.run('quest_herb_gather', 'Herbal Remedy', 'Gather 3 bundles of wild herbs from the jungle trails for the apothecary.',
  'ravi',
  JSON.stringify([{ type: 'gather', target: 'wild_herbs', count: 3 }]),
  JSON.stringify({ experience: 25, copper: 20, items: [{ item_id: 'herbal_tonic', quantity: 1 }] }),
  1, 'gathering');

// Link quests to NPCs (already done via quest_links in NPC data)
// Update Ravi to have herb quest link
db.prepare('UPDATE npcs SET quest_links = ? WHERE id = ?').run(JSON.stringify(['quest_herb_gather']), 'ravi');

// Create admin account
const bcrypt = require('bcryptjs');
const adminExists = db.prepare('SELECT id FROM accounts WHERE username = ?').get('admin');
if (!adminExists) {
  const { v4: uuid } = require('uuid');
  db.prepare('INSERT INTO accounts (id, username, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run(uuid(), 'admin', bcrypt.hashSync('ceylon1802', 10));
  console.log('Admin account created — username: admin, password: ceylon1802');
}

console.log('World seeded successfully!');
console.log(`Regions: ${(db.prepare('SELECT COUNT(*) as c FROM regions').get() as any).c}`);
console.log(`Rooms: ${(db.prepare('SELECT COUNT(*) as c FROM rooms').get() as any).c}`);
console.log(`Items: ${(db.prepare('SELECT COUNT(*) as c FROM items').get() as any).c}`);
console.log(`NPCs: ${(db.prepare('SELECT COUNT(*) as c FROM npcs').get() as any).c}`);
console.log(`Creatures: ${(db.prepare('SELECT COUNT(*) as c FROM creatures').get() as any).c}`);
console.log(`Skills: ${(db.prepare('SELECT COUNT(*) as c FROM skills').get() as any).c}`);
console.log(`Quests: ${(db.prepare('SELECT COUNT(*) as c FROM quests').get() as any).c}`);

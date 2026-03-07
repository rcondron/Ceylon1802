import db from '../db';
import { gameState, OnlinePlayer, LiveCreature } from './GameState';
import { v4 as uuid } from 'uuid';

type CommandHandler = (player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn) => void;
type SendFn = (characterId: string, msg: GameMessage) => void;
type BroadcastFn = (roomId: string, msg: GameMessage, excludeId?: string) => void;

export interface GameMessage {
  type: 'text' | 'room' | 'combat' | 'system' | 'chat' | 'error' | 'inventory' | 'status' | 'quest' | 'skill';
  content: string;
  data?: any;
}

// Direction aliases
const DIR_ALIASES: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down', north: 'north', south: 'south',
  east: 'east', west: 'west', up: 'up', down: 'down',
  northeast: 'northeast', northwest: 'northwest', southeast: 'southeast', southwest: 'southwest',
  in: 'in', out: 'out',
};

function getRoomData(roomId: string): any {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
}

function getRoomExits(roomId: string): any[] {
  return db.prepare('SELECT * FROM exits WHERE from_room_id = ?').all(roomId) as any[];
}

function getRoomNpcs(roomId: string): any[] {
  return db.prepare('SELECT * FROM npcs WHERE room_id = ?').all(roomId) as any[];
}

function getCharacter(characterId: string): any {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
}

function formatRoom(room: any, exits: any[], npcs: any[], players: OnlinePlayer[], creatures: LiveCreature[], currentPlayerId: string): GameMessage {
  let text = `\n**${room.title}**\n`;
  text += `${room.description_long}\n`;

  // Exits
  const exitDirs = exits.map(e => e.direction);
  text += `\n*Exits: ${exitDirs.join(', ')}*\n`;

  // NPCs
  for (const npc of npcs) {
    text += `\n  ${npc.name} (${npc.role}) is here.`;
  }

  // Creatures
  for (const c of creatures) {
    text += `\n  A **${c.name}** is here.`;
  }

  // Other players
  const otherPlayers = players.filter(p => p.characterId !== currentPlayerId);
  for (const p of otherPlayers) {
    text += `\n  **${p.characterName}** is here.`;
  }

  return {
    type: 'room',
    content: text,
    data: {
      roomId: room.id,
      title: room.title,
      exits: exits.map(e => ({ direction: e.direction, hidden: !!e.hidden })).filter(e => !e.hidden),
      npcs: npcs.map(n => ({ id: n.id, name: n.name, role: n.role })),
      creatures: creatures.map(c => ({ instanceId: c.instanceId, name: c.name })),
      players: otherPlayers.map(p => ({ id: p.characterId, name: p.characterName })),
      safeZone: !!room.safe_zone,
    }
  };
}

// LOOK command
function cmdLook(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const room = getRoomData(player.roomId);
  if (!room) { send(player.characterId, { type: 'error', content: 'You are in a void. Something is wrong.' }); return; }
  const exits = getRoomExits(player.roomId);
  const npcs = getRoomNpcs(player.roomId);
  const players = gameState.getPlayersInRoom(player.roomId);
  const creatures = gameState.getCreaturesInRoom(player.roomId);

  if (args.length > 0) {
    // Look at specific thing
    const target = args.join(' ').toLowerCase();

    // Check NPCs
    const npc = npcs.find(n => n.name.toLowerCase().includes(target));
    if (npc) {
      send(player.characterId, { type: 'text', content: `You look at ${npc.name}.\n${npc.description || 'Nothing remarkable.'}` });
      return;
    }

    // Check creatures
    const creature = creatures.find(c => c.name.toLowerCase().includes(target));
    if (creature) {
      send(player.characterId, { type: 'text', content: `You look at the ${creature.name}.\nHealth: ${creature.health}/${creature.healthMax}` });
      return;
    }

    // Check interactable objects
    const objects = JSON.parse(room.interactable_objects || '[]');
    const obj = objects.find((o: any) => o.name?.toLowerCase().includes(target));
    if (obj) {
      send(player.characterId, { type: 'text', content: obj.description || `You see ${obj.name}.` });
      return;
    }

    send(player.characterId, { type: 'text', content: `You don't see "${target}" here.` });
    return;
  }

  send(player.characterId, formatRoom(room, exits, npcs, players, creatures, player.characterId));
}

// MOVE command
function cmdMove(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (player.combatTarget) {
    send(player.characterId, { type: 'error', content: 'You are in combat! Use **flee** to escape.' });
    return;
  }

  const dirInput = args[0]?.toLowerCase();
  if (!dirInput) { send(player.characterId, { type: 'error', content: 'Go where?' }); return; }

  const direction = DIR_ALIASES[dirInput] || dirInput;
  const exits = getRoomExits(player.roomId);
  const exit = exits.find(e => e.direction === direction);

  if (!exit) {
    send(player.characterId, { type: 'error', content: `You can't go ${direction}.` });
    return;
  }

  // Check required flags
  const requiredFlags = JSON.parse(exit.required_flags || '[]');
  if (requiredFlags.length > 0) {
    const char = getCharacter(player.characterId);
    const charFlags = JSON.parse(char?.flags || '[]');
    for (const flag of requiredFlags) {
      if (!charFlags.includes(flag)) {
        send(player.characterId, { type: 'error', content: 'Something blocks your way.' });
        return;
      }
    }
  }

  const oldRoomId = player.roomId;
  broadcast(oldRoomId, { type: 'text', content: `**${player.characterName}** leaves ${direction}.` }, player.characterId);

  player.roomId = exit.to_room_id;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(exit.to_room_id, player.characterId);

  // Announce arrival
  const opposites: Record<string, string> = {
    north: 'south', south: 'north', east: 'west', west: 'east',
    up: 'below', down: 'above', in: 'outside', out: 'inside',
    northeast: 'southwest', northwest: 'southeast', southeast: 'northwest', southwest: 'northeast',
  };
  broadcast(exit.to_room_id, { type: 'text', content: `**${player.characterName}** arrives from the ${opposites[direction] || direction}.` }, player.characterId);

  // Show new room
  cmdLook(player, [], send, broadcast);

  // Check for spawns
  checkRoomSpawns(player.roomId);
}

// SAY command
function cmdSay(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Say what?' }); return; }
  const message = args.join(' ');
  broadcast(player.roomId, { type: 'chat', content: `**${player.characterName}** says: "${message}"`, data: { channel: 'local', speaker: player.characterName } });

  db.prepare('INSERT INTO chat_log (channel, character_id, character_name, message, room_id) VALUES (?, ?, ?, ?, ?)')
    .run('local', player.characterId, player.characterName, message, player.roomId);
}

// WHISPER command
function cmdWhisper(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length < 2) { send(player.characterId, { type: 'error', content: 'Usage: whisper <name> <message>' }); return; }
  const targetName = args[0];
  const message = args.slice(1).join(' ');

  let targetPlayer: OnlinePlayer | undefined;
  for (const p of gameState.players.values()) {
    if (p.characterName.toLowerCase() === targetName.toLowerCase()) { targetPlayer = p; break; }
  }

  if (!targetPlayer) { send(player.characterId, { type: 'error', content: `${targetName} is not online.` }); return; }

  send(targetPlayer.characterId, { type: 'chat', content: `**${player.characterName}** whispers: "${message}"`, data: { channel: 'whisper' } });
  send(player.characterId, { type: 'chat', content: `You whisper to **${targetPlayer.characterName}**: "${message}"`, data: { channel: 'whisper' } });
}

// INVENTORY command
function cmdInventory(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const items = db.prepare(`
    SELECT i.name, i.category, inv.quantity, inv.equipped, inv.equipped_slot, inv.durability, inv.id as inv_id
    FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.container_id IS NULL
    ORDER BY inv.equipped DESC, i.category, i.name
  `).all(player.characterId) as any[];

  if (items.length === 0) {
    send(player.characterId, { type: 'inventory', content: 'Your inventory is empty.' });
    return;
  }

  let text = '**Inventory:**\n';
  const equipped = items.filter(i => i.equipped);
  const carried = items.filter(i => !i.equipped);

  if (equipped.length > 0) {
    text += '\n*Equipped:*\n';
    for (const item of equipped) {
      text += `  [${item.equipped_slot}] ${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''}\n`;
    }
  }

  if (carried.length > 0) {
    text += '\n*Carried:*\n';
    for (const item of carried) {
      text += `  ${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''} (${item.category})\n`;
    }
  }

  send(player.characterId, { type: 'inventory', content: text, data: { items } });
}

// GET command
function cmdGet(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  // For now, only picking up from room resource nodes or dropped items would go here
  send(player.characterId, { type: 'text', content: 'There is nothing to pick up here.' });
}

// DROP command
function cmdDrop(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Drop what?' }); return; }
  const itemName = args.join(' ').toLowerCase();
  const invItem = db.prepare(`
    SELECT inv.id, i.name FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND lower(i.name) LIKE ? AND inv.equipped = 0 LIMIT 1
  `).get(player.characterId, `%${itemName}%`) as any;

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${args.join(' ')}".` }); return; }
  db.prepare('DELETE FROM inventory WHERE id = ?').run(invItem.id);
  send(player.characterId, { type: 'text', content: `You drop ${invItem.name}.` });
  broadcast(player.roomId, { type: 'text', content: `**${player.characterName}** drops ${invItem.name}.` }, player.characterId);
}

// EQUIP command
function cmdEquip(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Equip what?' }); return; }
  const itemName = args.join(' ').toLowerCase();
  const invItem = db.prepare(`
    SELECT inv.id, inv.item_id, i.name, i.slot FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND lower(i.name) LIKE ? AND inv.equipped = 0 LIMIT 1
  `).get(player.characterId, `%${itemName}%`) as any;

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${args.join(' ')}" to equip.` }); return; }
  if (!invItem.slot) { send(player.characterId, { type: 'error', content: `${invItem.name} cannot be equipped.` }); return; }

  // Unequip anything in that slot
  db.prepare('UPDATE inventory SET equipped = 0, equipped_slot = NULL WHERE character_id = ? AND equipped_slot = ?')
    .run(player.characterId, invItem.slot);

  db.prepare('UPDATE inventory SET equipped = 1, equipped_slot = ? WHERE id = ?').run(invItem.slot, invItem.id);
  send(player.characterId, { type: 'text', content: `You equip ${invItem.name} (${invItem.slot}).` });
}

// UNEQUIP command
function cmdUnequip(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Unequip what?' }); return; }
  const itemName = args.join(' ').toLowerCase();
  const invItem = db.prepare(`
    SELECT inv.id, i.name FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND lower(i.name) LIKE ? AND inv.equipped = 1 LIMIT 1
  `).get(player.characterId, `%${itemName}%`) as any;

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${args.join(' ')}" equipped.` }); return; }
  db.prepare('UPDATE inventory SET equipped = 0, equipped_slot = NULL WHERE id = ?').run(invItem.id);
  send(player.characterId, { type: 'text', content: `You unequip ${invItem.name}.` });
}

// STATUS command
function cmdStatus(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const char = getCharacter(player.characterId);
  if (!char) return;

  let text = `**${char.name}** — Level ${char.level}\n`;
  text += `${char.title || 'Newcomer'}\n\n`;
  text += `Health: ${char.health}/${char.health_max}  |  Stamina: ${char.stamina}/${char.stamina_max}  |  Focus: ${char.focus}/${char.focus_max}\n\n`;
  text += `STR: ${char.strength}  AGI: ${char.agility}  END: ${char.endurance}\n`;
  text += `INT: ${char.intellect}  PER: ${char.perception}  PRE: ${char.presence}  WIL: ${char.willpower}\n\n`;
  text += `Coins: ${char.currency_gold}g ${char.currency_silver}s ${char.currency_copper}c\n`;
  text += `XP: ${char.experience}`;

  send(player.characterId, { type: 'status', content: text, data: { character: char } });
}

// SKILLS command
function cmdSkills(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const skills = db.prepare(`
    SELECT s.name, s.category, cs.level, cs.experience
    FROM character_skills cs JOIN skills s ON cs.skill_id = s.id
    WHERE cs.character_id = ?
    ORDER BY s.category, s.name
  `).all(player.characterId) as any[];

  if (skills.length === 0) {
    send(player.characterId, { type: 'skill', content: 'You have no trained skills yet.' });
    return;
  }

  let text = '**Skills:**\n';
  let lastCat = '';
  for (const sk of skills) {
    if (sk.category !== lastCat) { text += `\n*${sk.category}:*\n`; lastCat = sk.category; }
    text += `  ${sk.name}: ${sk.level} (${sk.experience} xp)\n`;
  }
  send(player.characterId, { type: 'skill', content: text });
}

// TALK command
function cmdTalk(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Talk to whom?' }); return; }
  const npcName = args.join(' ').toLowerCase();
  const npcs = getRoomNpcs(player.roomId);
  const npc = npcs.find(n => n.name.toLowerCase().includes(npcName));

  if (!npc) { send(player.characterId, { type: 'error', content: `You don't see "${args.join(' ')}" here.` }); return; }

  const dialogueTree = JSON.parse(npc.dialogue_tree || '{}');
  const greeting = dialogueTree.greeting || `${npc.name} nods at you. "What can I do for you?"`;

  let text = `**${npc.name}** says: "${greeting}"\n`;

  // Show available dialogue options
  const options = dialogueTree.options || [];
  if (options.length > 0) {
    text += '\nTopics:\n';
    for (const opt of options) {
      text += `  - ${opt.keyword}: ${opt.label}\n`;
    }
  }

  // Check if NPC has a shop
  const shopInventory = JSON.parse(npc.shop_inventory || '[]');
  if (shopInventory.length > 0) {
    text += '\n*Type "buy <item>" or "sell <item>" to trade.*\n';
  }

  // Check if NPC has quests
  const questLinks = JSON.parse(npc.quest_links || '[]');
  if (questLinks.length > 0) {
    for (const questId of questLinks) {
      const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId) as any;
      const questState = db.prepare('SELECT * FROM character_quests WHERE character_id = ? AND quest_id = ?')
        .get(player.characterId, questId) as any;

      if (quest && (!questState || questState.state === 'available')) {
        text += `\n*${npc.name} has a task for you: "${quest.name}"*\n`;
        text += `*Type "accept ${quest.name.toLowerCase()}" to take the quest.*\n`;
      }
    }
  }

  send(player.characterId, { type: 'text', content: text, data: { npcId: npc.id, npcName: npc.name } });
}

// BUY command
function cmdBuy(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Buy what?' }); return; }
  const itemName = args.join(' ').toLowerCase();
  const npcs = getRoomNpcs(player.roomId);

  for (const npc of npcs) {
    const shopInv = JSON.parse(npc.shop_inventory || '[]');
    if (shopInv.length === 0) continue;

    for (const shopEntry of shopInv) {
      const item = db.prepare('SELECT * FROM items WHERE id = ?').get(shopEntry.item_id) as any;
      if (!item || !item.name.toLowerCase().includes(itemName)) continue;

      const price = shopEntry.price || item.value;
      const char = getCharacter(player.characterId);
      const totalCopper = char.currency_copper + char.currency_silver * 100 + char.currency_gold * 10000;

      if (totalCopper < price) {
        send(player.characterId, { type: 'error', content: `You can't afford ${item.name} (${price}c).` });
        return;
      }

      // Deduct cost
      const remaining = totalCopper - price;
      const gold = Math.floor(remaining / 10000);
      const silver = Math.floor((remaining % 10000) / 100);
      const copper = remaining % 100;
      db.prepare('UPDATE characters SET currency_gold = ?, currency_silver = ?, currency_copper = ? WHERE id = ?')
        .run(gold, silver, copper, player.characterId);

      // Add item
      db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, 1)')
        .run(uuid(), player.characterId, item.id);

      send(player.characterId, { type: 'text', content: `You buy ${item.name} for ${price}c from ${npc.name}.` });
      return;
    }
  }

  send(player.characterId, { type: 'error', content: `No one here sells "${args.join(' ')}".` });
}

// SELL command
function cmdSell(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Sell what?' }); return; }
  const itemName = args.join(' ').toLowerCase();

  const npcs = getRoomNpcs(player.roomId);
  const hasShop = npcs.some(n => JSON.parse(n.shop_inventory || '[]').length > 0);
  if (!hasShop) { send(player.characterId, { type: 'error', content: 'There is no merchant here.' }); return; }

  const invItem = db.prepare(`
    SELECT inv.id, i.name, i.value FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND lower(i.name) LIKE ? AND inv.equipped = 0 LIMIT 1
  `).get(player.characterId, `%${itemName}%`) as any;

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${args.join(' ')}" to sell.` }); return; }

  const sellPrice = Math.max(1, Math.floor(invItem.value * 0.5));
  db.prepare('DELETE FROM inventory WHERE id = ?').run(invItem.id);

  const char = getCharacter(player.characterId);
  let totalCopper = char.currency_copper + char.currency_silver * 100 + char.currency_gold * 10000 + sellPrice;
  const gold = Math.floor(totalCopper / 10000);
  const silver = Math.floor((totalCopper % 10000) / 100);
  const copper = totalCopper % 100;
  db.prepare('UPDATE characters SET currency_gold = ?, currency_silver = ?, currency_copper = ? WHERE id = ?')
    .run(gold, silver, copper, player.characterId);

  send(player.characterId, { type: 'text', content: `You sell ${invItem.name} for ${sellPrice}c.` });
}

// ATTACK command
function cmdAttack(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const room = getRoomData(player.roomId);
  if (room?.safe_zone) {
    send(player.characterId, { type: 'error', content: 'This is a safe zone. You cannot fight here.' });
    return;
  }

  const creatures = gameState.getCreaturesInRoom(player.roomId);
  if (creatures.length === 0) {
    send(player.characterId, { type: 'error', content: 'There is nothing to attack here.' });
    return;
  }

  let target: LiveCreature;
  if (args.length > 0) {
    const targetName = args.join(' ').toLowerCase();
    const found = creatures.find(c => c.name.toLowerCase().includes(targetName));
    if (!found) { send(player.characterId, { type: 'error', content: `You don't see "${args.join(' ')}" here.` }); return; }
    target = found;
  } else {
    if (player.combatTarget) {
      const existing = gameState.creatures.get(player.combatTarget);
      if (existing && existing.roomId === player.roomId) {
        target = existing;
      } else {
        target = creatures[0];
      }
    } else {
      target = creatures[0];
    }
  }

  player.combatTarget = target.instanceId;
  if (!target.combatTarget) target.combatTarget = player.characterId;

  performAttack(player, target, send, broadcast);
}

function performAttack(player: OnlinePlayer, target: LiveCreature, send: SendFn, broadcast: BroadcastFn): void {
  const now = Date.now();
  if (now - player.combatCooldown < 2500) {
    send(player.characterId, { type: 'combat', content: 'You are not ready to strike again yet.' });
    return;
  }
  player.combatCooldown = now;

  const char = getCharacter(player.characterId);
  const weapon = db.prepare(`
    SELECT i.* FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped = 1 AND inv.equipped_slot = 'main_hand' LIMIT 1
  `).get(player.characterId) as any;

  const baseDamage = weapon ? JSON.parse(weapon.properties || '{}').damage || 5 : 3;
  const strBonus = Math.floor((char.strength - 10) / 2);
  const hitChance = 60 + char.agility + (char.perception / 2) - target.dodge;
  const roll = Math.random() * 100;

  if (roll > hitChance) {
    send(player.characterId, { type: 'combat', content: `You swing at the ${target.name} but miss!` });
    broadcast(player.roomId, { type: 'combat', content: `**${player.characterName}** swings at the ${target.name} but misses.` }, player.characterId);
    return;
  }

  const damage = Math.max(1, baseDamage + strBonus + Math.floor(Math.random() * 4) - target.defense);
  const isCrit = roll < 10;
  const finalDamage = isCrit ? damage * 2 : damage;

  target.health -= finalDamage;

  const weaponName = weapon ? weapon.name : 'fists';
  if (isCrit) {
    send(player.characterId, { type: 'combat', content: `**Critical hit!** You strike the ${target.name} with your ${weaponName} for **${finalDamage}** damage!` });
    broadcast(player.roomId, { type: 'combat', content: `**${player.characterName}** lands a critical blow on the ${target.name}!` }, player.characterId);
  } else {
    send(player.characterId, { type: 'combat', content: `You strike the ${target.name} with your ${weaponName} for ${finalDamage} damage.` });
    broadcast(player.roomId, { type: 'combat', content: `**${player.characterName}** strikes the ${target.name}.` }, player.characterId);
  }

  if (target.health <= 0) {
    handleCreatureDeath(player, target, send, broadcast);
  }

  // Award combat skill XP
  awardSkillXP(player.characterId, 'blades', 2, send);
}

function handleCreatureDeath(player: OnlinePlayer, creature: LiveCreature, send: SendFn, broadcast: BroadcastFn): void {
  broadcast(player.roomId, { type: 'combat', content: `The ${creature.name} collapses!` });

  // Award XP
  const char = getCharacter(player.characterId);
  const xpGain = creature.experienceReward;
  const newXP = char.experience + xpGain;
  const xpForLevel = char.level * 100;

  if (newXP >= xpForLevel) {
    const newLevel = char.level + 1;
    db.prepare('UPDATE characters SET experience = ?, level = ?, health_max = health_max + 10, stamina_max = stamina_max + 5, health = health_max + 10, stamina = stamina_max + 5 WHERE id = ?')
      .run(newXP - xpForLevel, newLevel, player.characterId);
    send(player.characterId, { type: 'system', content: `**LEVEL UP!** You are now level ${newLevel}!` });
  } else {
    db.prepare('UPDATE characters SET experience = ? WHERE id = ?').run(newXP, player.characterId);
  }
  send(player.characterId, { type: 'combat', content: `You gain ${xpGain} experience.` });

  // Loot
  for (const lootEntry of creature.lootTable) {
    if (Math.random() < (lootEntry.chance || 0.5)) {
      db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, ?)')
        .run(uuid(), player.characterId, lootEntry.item_id, lootEntry.quantity || 1);
      const item = db.prepare('SELECT name FROM items WHERE id = ?').get(lootEntry.item_id) as any;
      if (item) {
        send(player.characterId, { type: 'text', content: `You find: ${item.name}${(lootEntry.quantity || 1) > 1 ? ` (x${lootEntry.quantity})` : ''}` });
      }
    }
  }

  // Update quest progress
  checkQuestProgress(player.characterId, 'kill', creature.creatureId, send);

  // Remove creature
  player.combatTarget = null;
  gameState.removeCreature(creature.instanceId);
}

// FLEE command
function cmdFlee(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (!player.combatTarget) {
    send(player.characterId, { type: 'error', content: 'You are not in combat.' });
    return;
  }

  const exits = getRoomExits(player.roomId);
  if (exits.length === 0) {
    send(player.characterId, { type: 'error', content: 'There is no escape!' });
    return;
  }

  if (Math.random() < 0.3) {
    send(player.characterId, { type: 'combat', content: 'You fail to disengage!' });
    return;
  }

  player.combatTarget = null;
  const randomExit = exits[Math.floor(Math.random() * exits.length)];
  send(player.characterId, { type: 'combat', content: `You flee ${randomExit.direction}!` });
  cmdMove(player, [randomExit.direction], send, broadcast);
}

// QUESTS command
function cmdQuests(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const quests = db.prepare(`
    SELECT q.name, q.description, cq.state, cq.progress
    FROM character_quests cq JOIN quests q ON cq.quest_id = q.id
    WHERE cq.character_id = ? AND cq.state != 'completed'
  `).all(player.characterId) as any[];

  if (quests.length === 0) {
    send(player.characterId, { type: 'quest', content: 'You have no active quests. Talk to NPCs to find work.' });
    return;
  }

  let text = '**Active Quests:**\n';
  for (const q of quests) {
    const progress = JSON.parse(q.progress || '{}');
    text += `\n  **${q.name}** [${q.state}]\n  ${q.description}\n`;
    if (progress.current && progress.target) {
      text += `  Progress: ${progress.current}/${progress.target}\n`;
    }
  }
  send(player.characterId, { type: 'quest', content: text });
}

// ACCEPT quest command
function cmdAccept(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Accept what quest?' }); return; }
  const questName = args.join(' ').toLowerCase();

  const npcs = getRoomNpcs(player.roomId);
  for (const npc of npcs) {
    const questLinks = JSON.parse(npc.quest_links || '[]');
    for (const questId of questLinks) {
      const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId) as any;
      if (!quest || !quest.name.toLowerCase().includes(questName)) continue;

      const existing = db.prepare('SELECT * FROM character_quests WHERE character_id = ? AND quest_id = ?')
        .get(player.characterId, questId) as any;

      if (existing && existing.state !== 'available') {
        send(player.characterId, { type: 'error', content: 'You already have this quest.' });
        return;
      }

      if (existing) {
        db.prepare('UPDATE character_quests SET state = ?, started_at = datetime("now") WHERE character_id = ? AND quest_id = ?')
          .run('active', player.characterId, questId);
      } else {
        db.prepare('INSERT INTO character_quests (character_id, quest_id, state, progress, started_at) VALUES (?, ?, ?, ?, datetime("now"))')
          .run(player.characterId, questId, 'active', JSON.stringify({}));
      }

      send(player.characterId, { type: 'quest', content: `**Quest accepted: ${quest.name}**\n${quest.description}` });
      return;
    }
  }

  send(player.characterId, { type: 'error', content: `No quest "${args.join(' ')}" available here.` });
}

// FORAGE command
function cmdForage(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const room = getRoomData(player.roomId);
  if (!room) return;

  const nodes = JSON.parse(room.resource_nodes || '[]');
  const forageNode = nodes.find((n: any) => n.type === 'forage');
  if (!forageNode) {
    send(player.characterId, { type: 'error', content: 'There is nothing to forage here.' });
    return;
  }

  const chance = 0.6;
  if (Math.random() < chance) {
    const itemId = forageNode.items[Math.floor(Math.random() * forageNode.items.length)];
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as any;
    if (item) {
      db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, 1)')
        .run(uuid(), player.characterId, item.id);
      send(player.characterId, { type: 'text', content: `You find: ${item.name}` });
      awardSkillXP(player.characterId, 'foraging', 3, send);
      checkQuestProgress(player.characterId, 'gather', item.id, send);
    }
  } else {
    send(player.characterId, { type: 'text', content: 'You search but find nothing useful.' });
    awardSkillXP(player.characterId, 'foraging', 1, send);
  }
}

// FISH command
function cmdFish(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const room = getRoomData(player.roomId);
  if (!room) return;

  const nodes = JSON.parse(room.resource_nodes || '[]');
  const fishNode = nodes.find((n: any) => n.type === 'fish');
  if (!fishNode) {
    send(player.characterId, { type: 'error', content: 'You can\'t fish here.' });
    return;
  }

  send(player.characterId, { type: 'text', content: 'You cast your line...' });
  // Fishing result determined immediately (real-time wait would be via client timer)
  const chance = 0.5;
  if (Math.random() < chance) {
    const itemId = fishNode.items[Math.floor(Math.random() * fishNode.items.length)];
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as any;
    if (item) {
      db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, 1)')
        .run(uuid(), player.characterId, item.id);
      send(player.characterId, { type: 'text', content: `You catch: ${item.name}!` });
      awardSkillXP(player.characterId, 'fishing', 3, send);
    }
  } else {
    send(player.characterId, { type: 'text', content: 'The line goes slack. Nothing bites.' });
    awardSkillXP(player.characterId, 'fishing', 1, send);
  }
}

// HELP command
function cmdHelp(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const text = `**Commands:**

**Movement:** north/n, south/s, east/e, west/w, up/u, down/d, ne, nw, se, sw
**Actions:** look [target], talk <npc>, buy <item>, sell <item>, forage, fish
**Combat:** attack [target], flee, defend
**Items:** inventory/inv, get <item>, drop <item>, equip <item>, unequip <item>
**Social:** say <msg>, whisper <name> <msg>, party invite/leave/list, who
**Info:** status, skills, quests, accept <quest>, help, map
**Admin:** /admin (if authorized)`;

  send(player.characterId, { type: 'system', content: text });
}

// WHO command
function cmdWho(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const online = Array.from(gameState.players.values());
  let text = `**Players Online (${online.length}):**\n`;
  for (const p of online) {
    text += `  ${p.characterName}\n`;
  }
  send(player.characterId, { type: 'system', content: text });
}

// MAP command
function cmdMap(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const room = getRoomData(player.roomId);
  const region = db.prepare('SELECT * FROM regions WHERE id = ?').get(room?.region_id) as any;
  const exits = getRoomExits(player.roomId);

  let text = `**Map — ${region?.name || 'Unknown'}**\n\n`;
  text += `You are at: ${room?.title}\n`;
  text += `Exits:\n`;
  for (const exit of exits) {
    const destRoom = getRoomData(exit.to_room_id);
    text += `  ${exit.direction} → ${destRoom?.title || 'Unknown'}\n`;
  }

  send(player.characterId, { type: 'system', content: text });
}

// PARTY commands
function cmdParty(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const subCmd = args[0]?.toLowerCase();

  if (!subCmd || subCmd === 'list') {
    if (!player.partyId) {
      send(player.characterId, { type: 'system', content: 'You are not in a party. Use "party create" to form one.' });
      return;
    }
    const party = gameState.parties.get(player.partyId);
    if (!party) return;
    let text = '**Party:**\n';
    for (const memberId of party.memberIds) {
      const member = gameState.getPlayer(memberId);
      const isLeader = memberId === party.leaderId ? ' (Leader)' : '';
      text += `  ${member?.characterName || 'Unknown'}${isLeader}\n`;
    }
    send(player.characterId, { type: 'system', content: text });
    return;
  }

  if (subCmd === 'create') {
    if (player.partyId) { send(player.characterId, { type: 'error', content: 'You are already in a party.' }); return; }
    const party = gameState.createParty(player.characterId);
    send(player.characterId, { type: 'system', content: `Party created. Invite others with "party invite <name>". Party ID: ${party.id.slice(0, 6)}` });
    return;
  }

  if (subCmd === 'invite') {
    if (!player.partyId) { send(player.characterId, { type: 'error', content: 'Create a party first.' }); return; }
    const targetName = args[1];
    if (!targetName) { send(player.characterId, { type: 'error', content: 'Invite whom?' }); return; }
    let target: OnlinePlayer | undefined;
    for (const p of gameState.players.values()) {
      if (p.characterName.toLowerCase() === targetName.toLowerCase()) { target = p; break; }
    }
    if (!target) { send(player.characterId, { type: 'error', content: `${targetName} is not online.` }); return; }
    if (gameState.joinParty(target.characterId, player.partyId)) {
      send(player.characterId, { type: 'system', content: `${target.characterName} joined your party.` });
      send(target.characterId, { type: 'system', content: `You joined ${player.characterName}'s party.` });
    }
    return;
  }

  if (subCmd === 'leave') {
    if (!player.partyId) { send(player.characterId, { type: 'error', content: 'You are not in a party.' }); return; }
    gameState.removeFromParty(player.characterId, player.partyId);
    send(player.characterId, { type: 'system', content: 'You left the party.' });
    return;
  }
}

// Skill XP helper
function awardSkillXP(characterId: string, skillId: string, amount: number, send: SendFn): void {
  const existing = db.prepare('SELECT * FROM character_skills WHERE character_id = ? AND skill_id = ?')
    .get(characterId, skillId) as any;

  if (!existing) {
    // Check if skill exists
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as any;
    if (!skill) return;
    db.prepare('INSERT INTO character_skills (character_id, skill_id, level, experience) VALUES (?, ?, 1, ?)')
      .run(characterId, skillId, amount);
    send(characterId, { type: 'skill', content: `New skill learned: **${skill.name}**!` });
    return;
  }

  const newXP = existing.experience + amount;
  const xpForLevel = existing.level * 50;
  if (newXP >= xpForLevel) {
    db.prepare('UPDATE character_skills SET level = level + 1, experience = ? WHERE character_id = ? AND skill_id = ?')
      .run(newXP - xpForLevel, characterId, skillId);
    const skill = db.prepare('SELECT name FROM skills WHERE id = ?').get(skillId) as any;
    send(characterId, { type: 'skill', content: `**${skill?.name}** advanced to level ${existing.level + 1}!` });
  } else {
    db.prepare('UPDATE character_skills SET experience = ? WHERE character_id = ? AND skill_id = ?')
      .run(newXP, characterId, skillId);
  }
}

// Quest progress helper
function checkQuestProgress(characterId: string, actionType: string, targetId: string, send: SendFn): void {
  const activeQuests = db.prepare(`
    SELECT cq.*, q.objectives, q.rewards, q.name as quest_name
    FROM character_quests cq JOIN quests q ON cq.quest_id = q.id
    WHERE cq.character_id = ? AND cq.state = 'active'
  `).all(characterId) as any[];

  for (const cq of activeQuests) {
    const objectives = JSON.parse(cq.objectives || '[]');
    let progress = JSON.parse(cq.progress || '{}');
    let updated = false;

    for (const obj of objectives) {
      if (obj.type === actionType && obj.target === targetId) {
        const key = `${obj.type}_${obj.target}`;
        progress[key] = (progress[key] || 0) + 1;
        progress.current = progress[key];
        progress.target = obj.count || 1;
        updated = true;

        if (progress[key] >= (obj.count || 1)) {
          // Check if all objectives complete
          const allDone = objectives.every((o: any) => {
            const k = `${o.type}_${o.target}`;
            return (progress[k] || 0) >= (o.count || 1);
          });

          if (allDone) {
            const rewards = JSON.parse(cq.rewards || '{}');
            db.prepare('UPDATE character_quests SET state = ?, progress = ?, completed_at = datetime("now") WHERE character_id = ? AND quest_id = ?')
              .run('completed', JSON.stringify(progress), characterId, cq.quest_id);

            send(characterId, { type: 'quest', content: `**Quest Complete: ${cq.quest_name}!**` });

            if (rewards.experience) {
              db.prepare('UPDATE characters SET experience = experience + ? WHERE id = ?').run(rewards.experience, characterId);
              send(characterId, { type: 'text', content: `You gain ${rewards.experience} experience.` });
            }
            if (rewards.copper) {
              db.prepare('UPDATE characters SET currency_copper = currency_copper + ? WHERE id = ?').run(rewards.copper, characterId);
              send(characterId, { type: 'text', content: `You receive ${rewards.copper} copper coins.` });
            }
            if (rewards.items) {
              for (const ri of rewards.items) {
                db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, ?)')
                  .run(uuid(), characterId, ri.item_id, ri.quantity || 1);
                const item = db.prepare('SELECT name FROM items WHERE id = ?').get(ri.item_id) as any;
                if (item) send(characterId, { type: 'text', content: `You receive: ${item.name}` });
              }
            }
            return;
          }
        }
      }
    }

    if (updated) {
      db.prepare('UPDATE character_quests SET progress = ? WHERE character_id = ? AND quest_id = ?')
        .run(JSON.stringify(progress), characterId, cq.quest_id);
    }
  }
}

// Room spawn checker
function checkRoomSpawns(roomId: string): void {
  const room = getRoomData(roomId);
  if (!room?.spawn_table_id) return;

  const existing = gameState.getCreaturesInRoom(roomId);
  const table = db.prepare('SELECT * FROM spawn_tables WHERE id = ?').get(room.spawn_table_id) as any;
  if (!table) return;

  const entries = JSON.parse(table.entries || '[]');
  if (existing.length >= table.max_concurrent) return;

  const lastSpawn = gameState.roomSpawnTimers.get(roomId) || 0;
  if (Date.now() - lastSpawn < table.respawn_seconds * 1000) return;

  // Spawn one random creature
  const entry = entries[Math.floor(Math.random() * entries.length)];
  if (entry) {
    gameState.spawnCreature(entry.creature_id, roomId);
    gameState.roomSpawnTimers.set(roomId, Date.now());
  }
}

// Creature AI tick — called periodically
export function creatureCombatTick(send: SendFn, broadcast: BroadcastFn): void {
  const now = Date.now();
  for (const creature of gameState.creatures.values()) {
    if (!creature.combatTarget) continue;

    const player = gameState.getPlayer(creature.combatTarget);
    if (!player || player.roomId !== creature.roomId) {
      creature.combatTarget = null;
      continue;
    }

    if (now - creature.lastAttack < creature.attackSpeed * 1000) continue;
    creature.lastAttack = now;

    const char = getCharacter(player.characterId);
    if (!char) continue;

    const hitChance = creature.accuracy - (char.agility / 2);
    if (Math.random() * 100 > hitChance) {
      broadcast(creature.roomId, { type: 'combat', content: `The ${creature.name} lunges at **${player.characterName}** but misses!` });
      continue;
    }

    const damage = Math.max(1, creature.attackMin + Math.floor(Math.random() * (creature.attackMax - creature.attackMin + 1)));
    const newHealth = Math.max(0, char.health - damage);
    db.prepare('UPDATE characters SET health = ? WHERE id = ?').run(newHealth, player.characterId);

    send(player.characterId, { type: 'combat', content: `The ${creature.name} strikes you for **${damage}** damage! (${newHealth}/${char.health_max} HP)` });
    broadcast(creature.roomId, { type: 'combat', content: `The ${creature.name} strikes **${player.characterName}**!` }, player.characterId);

    if (newHealth <= 0) {
      handlePlayerDefeat(player, send, broadcast);
    }
  }
}

function handlePlayerDefeat(player: OnlinePlayer, send: SendFn, broadcast: BroadcastFn): void {
  player.combatTarget = null;

  // Clear creature targeting
  for (const c of gameState.creatures.values()) {
    if (c.combatTarget === player.characterId) c.combatTarget = null;
  }

  broadcast(player.roomId, { type: 'combat', content: `**${player.characterName}** falls unconscious!` }, player.characterId);
  send(player.characterId, { type: 'combat', content: 'Everything goes dark...\n\nYou awaken at the harbor clinic, battered but alive.' });

  // Move to safe spawn
  const safeRoom = db.prepare('SELECT id FROM rooms WHERE safe_zone = 1 LIMIT 1').get() as any;
  if (safeRoom) {
    player.roomId = safeRoom.id;
    db.prepare('UPDATE characters SET room_id = ?, health = CAST(health_max * 0.5 AS INTEGER) WHERE id = ?')
      .run(safeRoom.id, player.characterId);
  } else {
    db.prepare('UPDATE characters SET health = CAST(health_max * 0.5 AS INTEGER) WHERE id = ?')
      .run(player.characterId);
  }

  // Small coin loss
  const char = getCharacter(player.characterId);
  const coinLoss = Math.floor(char.currency_copper * 0.1);
  if (coinLoss > 0) {
    db.prepare('UPDATE characters SET currency_copper = currency_copper - ? WHERE id = ?').run(coinLoss, player.characterId);
    send(player.characterId, { type: 'text', content: `You lost ${coinLoss} copper coins.` });
  }

  // Show new room
  cmdLook(player, [], send, broadcast);
}

// Command registry
const COMMANDS: Record<string, CommandHandler> = {
  look: cmdLook, l: cmdLook,
  say: cmdSay, "'": cmdSay,
  whisper: cmdWhisper, tell: cmdWhisper,
  inventory: cmdInventory, inv: cmdInventory, i: cmdInventory,
  get: cmdGet, take: cmdGet,
  drop: cmdDrop,
  equip: cmdEquip, wear: cmdEquip, wield: cmdEquip,
  unequip: cmdUnequip, remove: cmdUnequip,
  status: cmdStatus, score: cmdStatus, stat: cmdStatus,
  skills: cmdSkills,
  talk: cmdTalk, speak: cmdTalk,
  buy: cmdBuy, purchase: cmdBuy,
  sell: cmdSell,
  attack: cmdAttack, kill: cmdAttack, hit: cmdAttack, k: cmdAttack,
  flee: cmdFlee, run: cmdFlee,
  quests: cmdQuests, quest: cmdQuests,
  accept: cmdAccept,
  forage: cmdForage, gather: cmdForage,
  fish: cmdFish,
  help: cmdHelp, '?': cmdHelp,
  who: cmdWho,
  map: cmdMap,
  party: cmdParty, group: cmdParty,
};

// Add direction commands
for (const [alias, dir] of Object.entries(DIR_ALIASES)) {
  if (!COMMANDS[alias]) {
    COMMANDS[alias] = (player, args, send, broadcast) => cmdMove(player, [dir], send, broadcast);
  }
}
COMMANDS['go'] = cmdMove;
COMMANDS['move'] = cmdMove;

export function processCommand(input: string, player: OnlinePlayer, send: SendFn, broadcast: BroadcastFn): void {
  const trimmed = input.trim();
  if (!trimmed) return;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = COMMANDS[cmd];
  if (handler) {
    handler(player, args, send, broadcast);
  } else {
    send(player.characterId, { type: 'error', content: `Unknown command: "${cmd}". Type "help" for commands.` });
  }
}

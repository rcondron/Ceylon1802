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

// Ordinal parsing: "second sword" -> { ordinal: 2, rest: "sword" }, "3" -> { ordinal: 3, rest: "" }
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, 1: 1, one: 1,
  second: 2, 2: 2, two: 2,
  third: 3, 3: 3, three: 3,
  fourth: 4, 4: 4, four: 4,
  fifth: 5, 5: 5, five: 5,
  sixth: 6, 6: 6, six: 6,
  seventh: 7, 7: 7, seven: 7,
  eighth: 8, 8: 8, eight: 8,
  ninth: 9, 9: 9, nine: 9,
  tenth: 10, 10: 10, ten: 10,
};
function parseOrdinal(s: string): { ordinal: number | null; rest: string } {
  const lower = s.trim().toLowerCase();
  if (!lower) return { ordinal: null, rest: '' };
  const words = lower.split(/\s+/);
  const first = words[0];
  if (ORDINAL_WORDS[first] != null) {
    const rest = words.slice(1).join(' ').trim();
    return { ordinal: ORDINAL_WORDS[first], rest };
  }
  if (/^\d+$/.test(first) && words.length >= 1) {
    const n = parseInt(first, 10);
    const rest = words.slice(1).join(' ').trim();
    return { ordinal: n >= 1 ? n : null, rest };
  }
  return { ordinal: null, rest: lower };
}
function pickByOrdinal<T>(list: T[], nameMatch: (item: T) => boolean, ordinal: number | null): T | null {
  const matches = list.filter(nameMatch);
  if (matches.length === 0) return null;
  const index = ordinal != null && ordinal >= 1 ? ordinal - 1 : 0;
  if (index >= matches.length) return null;
  return matches[index];
}

function getRoomData(roomId: string): any {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
}

function getRoomExits(roomId: string): any[] {
  return db.prepare('SELECT * FROM exits WHERE from_room_id = ?').all(roomId) as any[];
}

function getRoomGates(roomId: string): any[] {
  return db.prepare('SELECT * FROM gates WHERE from_room_id = ?').all(roomId) as any[];
}

function getRoomNpcs(roomId: string): any[] {
  return db.prepare('SELECT * FROM npcs WHERE room_id = ?').all(roomId) as any[];
}

function getCharacter(characterId: string): any {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
}

function getRoomGroundItems(roomId: string): { name: string; quantity: number }[] {
  const rows = db.prepare(`
    SELECT i.name, r.quantity FROM room_items r JOIN items i ON r.item_id = i.id WHERE r.room_id = ?
  `).all(roomId) as any[];
  return rows;
}

function formatRoom(room: any, exits: any[], gates: any[], npcs: any[], players: OnlinePlayer[], creatures: LiveCreature[], currentPlayerId: string): GameMessage {
  let text = `\n**${room.title}**\n`;
  text += `${room.description_long}\n`;

  // Gates (cross-region doors) — shown right after description as "You also see: ..."
  if (gates.length > 0) {
    const gateLabels: string[] = [];
    const doorGates: any[] = [];
    for (const g of gates) {
      const keywords = (g.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean);
      if (keywords.includes('door')) doorGates.push(g);
      const label = keywords.find((k: string) => k !== 'door' && k !== 'back' && k !== 'out') || keywords[0];
      if (label) gateLabels.push(label);
    }
    let gateText = `You also see: ${gateLabels.join(', ')}`;
    if (doorGates.length > 1) gateText += ` *(${doorGates.length} doors — go first door, go second door…)*`;
    text += gateText + '\n';
  }

  // Exits (cardinal — within region)
  const exitDirs = exits.map(e => e.direction);
  if (exitDirs.length > 0) text += `*Exits: ${exitDirs.join(', ')}*\n`;

  // Also here: NPCs, creatures, other players (single comma-separated line after exits)
  const otherPlayers = players.filter(p => p.characterId !== currentPlayerId);
  const alsoHere: string[] = [];
  for (const npc of npcs) alsoHere.push(npc.name);
  for (const c of creatures) alsoHere.push(`A **${c.name}**`);
  for (const p of otherPlayers) alsoHere.push(`**${p.characterName}**`);
  if (alsoHere.length > 0) {
    text += `\n*Also here:* ${alsoHere.join(', ')}\n`;
  }

  // Items on the ground
  const groundItems = getRoomGroundItems(room.id);
  if (groundItems.length > 0) {
    text += `\n*Items:*\n`;
    for (const it of groundItems) {
      text += `  ${it.name}${it.quantity > 1 ? ` (x${it.quantity})` : ''}\n`;
    }
  }

  const region = db.prepare('SELECT id, name FROM regions WHERE id = ?').get(room.region_id) as any;
  return {
    type: 'room',
    content: text,
    data: {
      roomId: room.id,
      regionId: room.region_id || '',
      regionName: region?.name || 'Unknown',
      title: room.title,
      description: room.description_long || '',
      exits: exits.filter(e => !e.hidden).map(e => {
        const toRoom = getRoomData(e.to_room_id);
        return { direction: e.direction, to_room_id: e.to_room_id, to_title: toRoom?.title || '?' };
      }),
      gates: gates.map(g => ({
        keywords: (g.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean),
        to_room_id: g.to_room_id,
        to_title: getRoomData(g.to_room_id)?.title || '?',
      })),
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
  const gates = getRoomGates(player.roomId);
  const npcs = getRoomNpcs(player.roomId);
  const players = gameState.getPlayersInRoom(player.roomId);
  const creatures = gameState.getCreaturesInRoom(player.roomId);

  if (args.length > 0) {
    const target = args.join(' ').toLowerCase();

    // "look in <container>" — show contents of a container you have
    const inMatch = target.match(/^in(?:side)?\s+(.+)$/);
    if (inMatch) {
      const containerName = inMatch[1].trim();
      const container = db.prepare(`
        SELECT inv.id, i.name, i.container_slots FROM inventory inv JOIN items i ON inv.item_id = i.id
        WHERE inv.character_id = ? AND lower(i.name) LIKE ? AND i.container_slots > 0 LIMIT 1
      `).get(player.characterId, `%${containerName}%`) as any;
      if (!container) { send(player.characterId, { type: 'error', content: `You don't have a container called "${containerName}".` }); return; }
      const contents = db.prepare(`
        SELECT i.name, i.size, inv.quantity FROM inventory inv JOIN items i ON inv.item_id = i.id
        WHERE inv.character_id = ? AND inv.container_id = ?
      `).all(player.characterId, container.id) as any[];
      const usedSlots = contents.reduce((sum: number, c: any) => sum + (c.size || 1) * (c.quantity || 1), 0);
      let text = `**${container.name}** (${usedSlots}/${container.container_slots} slots used):\n`;
      if (contents.length === 0) {
        text += '  Empty.\n';
      } else {
        for (const c of contents) {
          text += `  ${c.name}${c.quantity > 1 ? ` (x${c.quantity})` : ''} [size ${c.size || 1}]\n`;
        }
      }
      send(player.characterId, { type: 'text', content: text });
      return;
    }

    // Look at yourself
    if (target === 'self' || target === 'me' || target === 'myself' || target === player.characterName.toLowerCase()) {
      const char = getCharacter(player.characterId);
      if (!char) return;
      let text = `**${char.name}** — Level ${char.level} ${char.background || 'Newcomer'}\n`;
      text += `Health: ${char.health}/${char.health_max}  |  Stamina: ${char.stamina}/${char.stamina_max}\n`;
      const worn = getWornItems(player.characterId);
      if (worn.length > 0) {
        text += `\n**Wearing:** ${worn.map((w: any) => w.name).join(', ')}.\n`;
      } else {
        text += `\n**Wearing:** nothing.\n`;
      }
      const hands = getHands(player.characterId);
      const held: string[] = [];
      if (hands.right) held.push(hands.right.name);
      if (hands.left) held.push(hands.left.name);
      if (held.length > 0) {
        text += `**Holding:** ${held.join(', ')}.\n`;
      } else {
        text += `**Holding:** nothing.\n`;
      }
      send(player.characterId, { type: 'status', content: text, data: { character: char } });
      return;
    }

    // Check other players
    const otherPlayer = players.find(p => p.characterId !== player.characterId && p.characterName.toLowerCase().includes(target));
    if (otherPlayer) {
      const oChar = getCharacter(otherPlayer.characterId);
      if (oChar) {
        let text = `**${oChar.name}** is a level ${oChar.level} ${oChar.background || 'adventurer'}.\n`;
        const worn = getWornItems(otherPlayer.characterId);
        if (worn.length > 0) {
          text += `${oChar.name} is wearing: ${worn.map(w => w.name).join(', ')}.\n`;
        }
        const hands = getHands(otherPlayer.characterId);
        const held: string[] = [];
        if (hands.right) held.push(hands.right.name);
        if (hands.left) held.push(hands.left.name);
        if (held.length > 0) {
          text += `${oChar.name} is holding: ${held.join(', ')}.\n`;
        }
        send(player.characterId, { type: 'text', content: text });
        return;
      }
    }

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

  send(player.characterId, formatRoom(room, exits, gates, npcs, players, creatures, player.characterId));
}

// INTERACT command — go <object>, enter <object>, climb <object>, open <object>
function cmdInteract(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn, verb: string): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: `${verb.charAt(0).toUpperCase() + verb.slice(1)} what?` }); return; }
  const target = args.join(' ').toLowerCase();

  const room = getRoomData(player.roomId);
  if (!room) return;
  const objects: any[] = JSON.parse(room.interactable_objects || '[]');
  const obj = objects.find((o: any) => o.name?.toLowerCase().includes(target));

  if (obj) {
    if (obj.action === 'exit' && obj.to_room_id) {
      const toRoom = getRoomData(obj.to_room_id);
      if (toRoom) {
        const oldRoomId = player.roomId;
        broadcast(oldRoomId, { type: 'text', content: `**${player.characterName}** goes through the ${obj.name}.` }, player.characterId);
        player.roomId = obj.to_room_id;
        db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(obj.to_room_id, player.characterId);
        broadcast(obj.to_room_id, { type: 'text', content: `**${player.characterName}** enters.` }, player.characterId);
        cmdLook(player, [], send, broadcast);
        const spawned = checkRoomSpawns(player.roomId);
        if (spawned) {
          broadcast(player.roomId, { type: 'text', content: `A **${spawned.name}** enters.` });
        }
        return;
      }
    }
    if (obj.locked) { send(player.characterId, { type: 'text', content: 'The door is locked.' }); return; }
    if (obj.interact_text) { send(player.characterId, { type: 'text', content: obj.interact_text }); return; }
  }

  const climbables = ['tree', 'wall', 'cliff', 'rock', 'ladder', 'rope', 'vine'];
  const doorLike = ['door', 'gate', 'entrance', 'archway', 'passage', 'hatch'];
  const goables = ['shop', 'store', 'house', 'building', 'hut', 'shack', 'cabin', 'cave', 'bridge', 'path', 'road', 'trail', 'alley'];

  if (verb === 'climb') {
    if (climbables.some(c => target.includes(c))) {
      send(player.characterId, { type: 'text', content: 'There are no branches low enough to reach.' });
    } else {
      send(player.characterId, { type: 'text', content: `You can't climb that.` });
    }
    return;
  }

  if (verb === 'open' || doorLike.some(d => target.includes(d))) {
    send(player.characterId, { type: 'text', content: 'The door is locked.' });
    return;
  }

  if (climbables.some(c => target.includes(c))) {
    send(player.characterId, { type: 'text', content: `You'll need to climb that.` });
    return;
  }

  send(player.characterId, { type: 'text', content: `You can't go there.` });
}

// MOVE command
function cmdMove(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (player.combatTarget) {
    send(player.characterId, { type: 'error', content: 'You are in combat! Use **flee** to escape.' });
    return;
  }

  const dirInput = args[0]?.toLowerCase();
  if (!dirInput) { send(player.characterId, { type: 'error', content: 'Go where?' }); return; }

  // 1) Cardinal direction — exit within region
  const direction = DIR_ALIASES[dirInput] || dirInput;
  const exits = getRoomExits(player.roomId);
  const exit = exits.find(e => e.direction === direction);

  if (exit) {
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
    doMoveToRoom(player, exit.to_room_id, direction, send, broadcast);
    return;
  }

  // 2) Gate keyword — cross-region (e.g. go forge, go first door, go grove, go door)
  const gatePhrase = args.join(' ').toLowerCase().trim();
  if (gatePhrase) {
    const gates = getRoomGates(player.roomId);

    // Parse ordinal: "first door" -> ordinal 1, rest "door"; "second door" -> ordinal 2, rest "door"
    const { ordinal, rest: basePhrase } = parseOrdinal(gatePhrase);
    const searchPhrase = basePhrase || gatePhrase;

    // Find all gates whose keywords match the search phrase
    const matchingGates = gates.filter(g => {
      const keywords = (g.keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      return keywords.some((k: string) => k === searchPhrase || searchPhrase.includes(k) || k.includes(searchPhrase));
    });

    // Also try exact full phrase (e.g. "first door" as a literal keyword)
    if (matchingGates.length === 0) {
      const exactGate = gates.find(g => {
        const keywords = (g.keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
        return keywords.some((k: string) => k === gatePhrase || gatePhrase.includes(k) || k.includes(gatePhrase));
      });
      if (exactGate) {
        doMoveToRoom(player, exactGate.to_room_id, gatePhrase, send, broadcast);
        return;
      }
    }

    if (matchingGates.length > 0) {
      const idx = ordinal != null ? ordinal - 1 : 0;
      const gate = matchingGates[idx];
      if (gate) {
        doMoveToRoom(player, gate.to_room_id, gatePhrase, send, broadcast);
        return;
      }
      send(player.characterId, { type: 'error', content: `There is no ${gatePhrase} here.` });
      return;
    }
  }

  cmdInteract(player, args, send, broadcast, 'go');
}

function doMoveToRoom(player: OnlinePlayer, toRoomId: string, label: string, send: SendFn, broadcast: BroadcastFn): void {
  const oldRoomId = player.roomId;
  broadcast(oldRoomId, { type: 'text', content: `**${player.characterName}** leaves ${label}.` }, player.characterId);
  player.roomId = toRoomId;
  db.prepare('UPDATE characters SET room_id = ? WHERE id = ?').run(toRoomId, player.characterId);
  broadcast(toRoomId, { type: 'text', content: `**${player.characterName}** enters.` }, player.characterId);
  cmdLook(player, [], send, broadcast);
  const spawned = checkRoomSpawns(player.roomId);
  if (spawned) {
    broadcast(player.roomId, { type: 'text', content: `A **${spawned.name}** enters.` });
  }
}

// SAY command
function cmdSay(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Say what?' }); return; }
  const message = args.join(' ');
  broadcast(player.roomId, { type: 'chat', content: `**${player.characterName}** says: "${message}"`, data: { channel: 'local', speaker: player.characterName } });

  db.prepare('INSERT INTO chat_log (channel, character_id, character_name, message, room_id) VALUES (?, ?, ?, ?, ?)')
    .run('local', player.characterId, player.characterName, message, player.roomId);
}

// WHISPER command — private message to a player in the same room
function cmdWhisper(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length < 2) { send(player.characterId, { type: 'error', content: 'Usage: whisper <name> <message>' }); return; }
  const targetName = args[0];
  const message = args.slice(1).join(' ');

  const inRoom = gameState.getPlayersInRoom(player.roomId);
  const targetPlayer = inRoom.find(p => p.characterId !== player.characterId && p.characterName.toLowerCase() === targetName.toLowerCase());

  if (!targetPlayer) {
    send(player.characterId, { type: 'error', content: `No one here named "${targetName}".` });
    return;
  }

  send(targetPlayer.characterId, { type: 'chat', content: `**${player.characterName}** whispers: "${message}"`, data: { channel: 'whisper' } });
  send(player.characterId, { type: 'chat', content: `You whisper to **${targetPlayer.characterName}**: "${message}"`, data: { channel: 'whisper' } });
}

// INVENTORY command
function cmdInventory(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const items = db.prepare(`
    SELECT i.name, i.category, inv.quantity, inv.equipped, inv.equipped_slot, inv.durability, inv.id as inv_id,
           i.container_slots, i.size
    FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.container_id IS NULL
    ORDER BY inv.equipped DESC, i.category, i.name
  `).all(player.characterId) as any[];

  if (items.length === 0) {
    send(player.characterId, { type: 'inventory', content: 'Your inventory is empty.' });
    return;
  }

  let text = '**Inventory:**\n';
  const hands = items.filter(i => i.equipped_slot === 'right_hand' || i.equipped_slot === 'left_hand');
  const worn = items.filter(i => i.equipped && i.equipped_slot !== 'right_hand' && i.equipped_slot !== 'left_hand');
  const carried = items.filter(i => !i.equipped);

  if (hands.length > 0) {
    text += '\n*Holding:*\n';
    for (const item of hands) {
      const label = item.equipped_slot === 'right_hand' ? 'Right hand' : 'Left hand';
      text += `  [${label}] ${item.name}\n`;
    }
  }

  if (worn.length > 0) {
    text += '\n*Wearing:*\n';
    for (const item of worn) {
      let line = `  [${item.equipped_slot}] ${item.name}`;
      if (item.container_slots > 0) {
        const contents = db.prepare(`
          SELECT i.name, i.size, inv.quantity FROM inventory inv JOIN items i ON inv.item_id = i.id
          WHERE inv.character_id = ? AND inv.container_id = ?
        `).all(player.characterId, item.inv_id) as any[];
        const usedSlots = contents.reduce((s: number, c: any) => s + (c.size || 1) * (c.quantity || 1), 0);
        line += ` (${usedSlots}/${item.container_slots} slots)`;
        if (contents.length > 0) {
          line += '\n';
          for (const c of contents) {
            line += `    └ ${c.name}${c.quantity > 1 ? ` (x${c.quantity})` : ''}\n`;
          }
          text += line;
          continue;
        }
      }
      text += line + '\n';
    }
  }

  if (carried.length > 0) {
    text += '\n*Carried:*\n';
    for (const item of carried) {
      let line = `  ${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''}`;
      if (item.container_slots > 0) {
        const contents = db.prepare(`
          SELECT i.name, i.size, inv.quantity FROM inventory inv JOIN items i ON inv.item_id = i.id
          WHERE inv.character_id = ? AND inv.container_id = ?
        `).all(player.characterId, item.inv_id) as any[];
        const usedSlots = contents.reduce((s: number, c: any) => s + (c.size || 1) * (c.quantity || 1), 0);
        line += ` (${usedSlots}/${item.container_slots} slots)`;
        if (contents.length > 0) {
          line += '\n';
          for (const c of contents) {
            line += `    └ ${c.name}${c.quantity > 1 ? ` (x${c.quantity})` : ''}\n`;
          }
          text += line;
          continue;
        }
      }
      text += line + '\n';
    }
  }

  send(player.characterId, { type: 'inventory', content: text, data: { items } });
}

function pickUpItem(player: OnlinePlayer, groundId: string, itemId: string, itemName: string, quantity: number, send: SendFn, broadcast: BroadcastFn): void {
  const item = db.prepare('SELECT slot, size FROM items WHERE id = ?').get(itemId) as any;
  const itemSize = item?.size || 1;
  const char = getCharacter(player.characterId);
  if (char && itemSize > char.strength) {
    send(player.characterId, { type: 'error', content: `${itemName} is too heavy for you to carry. (size ${itemSize}, your strength is ${char.strength})` });
    return;
  }
  db.prepare('DELETE FROM room_items WHERE id = ?').run(groundId);
  if (item?.slot === 'hand') {
    const hand = freeHand(player.characterId);
    if (!hand) {
      db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, ?)')
        .run(uuid(), player.characterId, itemId, quantity);
      send(player.characterId, { type: 'text', content: `You pick up ${itemName} (your hands are full, it goes in your pack).` });
    } else {
      const invId = uuid();
      db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity, equipped, equipped_slot) VALUES (?, ?, ?, ?, 1, ?)')
        .run(invId, player.characterId, itemId, quantity, hand);
      const handLabel = hand === 'right_hand' ? 'right hand' : 'left hand';
      send(player.characterId, { type: 'text', content: `You pick up ${itemName} in your ${handLabel}.` });
    }
  } else {
    db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, ?)')
      .run(uuid(), player.characterId, itemId, quantity);
    send(player.characterId, { type: 'text', content: `You pick up ${itemName}.` });
  }
  broadcast(player.roomId, { type: 'text', content: `**${player.characterName}** picks up ${itemName}.` }, player.characterId);
}

// GET command
function cmdGet(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Get what?' }); return; }
  const raw = args.join(' ').toLowerCase();

  // "get X from Y" — take from a container in inventory
  const fromMatch = raw.match(/^(.+?)\s+from\s+(.+)$/);
  if (fromMatch) {
    const targetItem = fromMatch[1].trim();
    const containerName = fromMatch[2].trim();
    const container = db.prepare(`
      SELECT inv.id, i.name, i.container_slots FROM inventory inv JOIN items i ON inv.item_id = i.id
      WHERE inv.character_id = ? AND lower(i.name) LIKE ? AND i.container_slots > 0 LIMIT 1
    `).get(player.characterId, `%${containerName}%`) as any;
    if (!container) { send(player.characterId, { type: 'error', content: `You don't have a container called "${fromMatch[2].trim()}".` }); return; }
    const inside = db.prepare(`
      SELECT inv.id, inv.item_id, inv.quantity, i.name, i.slot FROM inventory inv JOIN items i ON inv.item_id = i.id
      WHERE inv.character_id = ? AND inv.container_id = ? AND lower(i.name) LIKE ? LIMIT 1
    `).get(player.characterId, container.id, `%${targetItem}%`) as any;
    if (!inside) { send(player.characterId, { type: 'error', content: `Nothing like that in your ${containerName}.` }); return; }
    if (inside.slot === 'hand') {
      const hand = freeHand(player.characterId);
      if (hand) {
        db.prepare('UPDATE inventory SET container_id = NULL, equipped = 1, equipped_slot = ? WHERE id = ?').run(hand, inside.id);
        const handLabel = hand === 'right_hand' ? 'right hand' : 'left hand';
        send(player.characterId, { type: 'text', content: `You take ${inside.name} from your ${containerName} into your ${handLabel}.` });
      } else {
        db.prepare('UPDATE inventory SET container_id = NULL WHERE id = ?').run(inside.id);
        send(player.characterId, { type: 'text', content: `You take ${inside.name} from your ${containerName} (hands full, it goes in your pack).` });
      }
    } else {
      db.prepare('UPDATE inventory SET container_id = NULL WHERE id = ?').run(inside.id);
      send(player.characterId, { type: 'text', content: `You take ${inside.name} from your ${containerName}.` });
    }
    return;
  }

  if (raw === 'all') {
    const all = db.prepare(`
      SELECT r.id, r.item_id, r.quantity, i.name FROM room_items r JOIN items i ON r.item_id = i.id WHERE r.room_id = ?
    `).all(player.roomId) as any[];
    if (all.length === 0) {
      send(player.characterId, { type: 'text', content: 'There is nothing to pick up here.' });
      return;
    }
    for (const g of all) {
      pickUpItem(player, g.id, g.item_id, g.name, g.quantity || 1, send, broadcast);
    }
    return;
  }

  const allGround = db.prepare(`
    SELECT r.id, r.item_id, r.quantity, i.name FROM room_items r JOIN items i ON r.item_id = i.id
    WHERE r.room_id = ?
  `).all(player.roomId) as any[];
  const { ordinal, rest } = parseOrdinal(raw);
  const namePart = rest || raw.toLowerCase();
  const ground = pickByOrdinal(allGround, r => r.name.toLowerCase().includes(namePart), ordinal);
  if (!ground) {
    send(player.characterId, { type: 'text', content: 'There is nothing like that here.' });
    return;
  }
  pickUpItem(player, ground.id, ground.item_id, ground.name, ground.quantity || 1, send, broadcast);
}

// DROP command — drops from hands first, then pack. Supports ordinal: "drop second sword"
function cmdDrop(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Drop what?' }); return; }
  const raw = args.join(' ').trim();
  const { ordinal, rest } = parseOrdinal(raw);
  const namePart = (rest || raw).toLowerCase();
  const handItems = db.prepare(`
    SELECT inv.id, inv.item_id, inv.quantity, inv.equipped_slot, i.name FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped_slot IN ('right_hand','left_hand')
  `).all(player.characterId) as any[];
  const allInv = db.prepare(`
    SELECT inv.id, inv.item_id, inv.quantity, i.name FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ?
  `).all(player.characterId) as any[];
  const invItem = pickByOrdinal(handItems, r => r.name.toLowerCase().includes(namePart), ordinal)
    || pickByOrdinal(allInv, r => r.name.toLowerCase().includes(namePart), ordinal);

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${raw}".` }); return; }

  // If dropping a container, spill its contents into the player's pack
  const contentsInside = db.prepare(`
    SELECT inv.id, i.name FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.container_id = ?
  `).all(player.characterId, invItem.id) as any[];
  if (contentsInside.length > 0) {
    db.prepare('UPDATE inventory SET container_id = NULL WHERE character_id = ? AND container_id = ?')
      .run(player.characterId, invItem.id);
    const names = contentsInside.map((c: any) => c.name).join(', ');
    send(player.characterId, { type: 'text', content: `The contents of ${invItem.name} spill out: ${names}.` });
  }

  db.prepare('DELETE FROM inventory WHERE id = ?').run(invItem.id);
  db.prepare('INSERT INTO room_items (id, room_id, item_id, quantity) VALUES (?, ?, ?, ?)')
    .run(uuid(), player.roomId, invItem.item_id, invItem.quantity || 1);
  send(player.characterId, { type: 'text', content: `You drop ${invItem.name}.` });
  broadcast(player.roomId, { type: 'text', content: `**${player.characterName}** drops ${invItem.name}.` }, player.characterId);
}

function getHands(characterId: string): { right: any; left: any } {
  const right = db.prepare(`
    SELECT inv.id, inv.item_id, i.name, i.slot, i.category FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped = 1 AND inv.equipped_slot = 'right_hand' LIMIT 1
  `).get(characterId) as any || null;
  const left = db.prepare(`
    SELECT inv.id, inv.item_id, i.name, i.slot, i.category FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped = 1 AND inv.equipped_slot = 'left_hand' LIMIT 1
  `).get(characterId) as any || null;
  return { right, left };
}

function getWornItems(characterId: string): any[] {
  return db.prepare(`
    SELECT inv.id, inv.equipped_slot, i.name, i.category FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped = 1 AND inv.equipped_slot NOT IN ('right_hand','left_hand')
    ORDER BY i.category
  `).all(characterId) as any[];
}

function freeHand(characterId: string): string | null {
  const hands = getHands(characterId);
  if (!hands.right) return 'right_hand';
  if (!hands.left) return 'left_hand';
  return null;
}

// EQUIP command. Supports ordinal: "equip second sword"
function cmdEquip(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Equip what?' }); return; }
  const raw = args.join(' ').trim();
  const { ordinal, rest } = parseOrdinal(raw);
  const namePart = (rest || raw).toLowerCase();
  const unequipped = db.prepare(`
    SELECT inv.id, inv.item_id, i.name, i.slot, i.category FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped = 0
  `).all(player.characterId) as any[];
  const invItem = pickByOrdinal(unequipped, r => r.name.toLowerCase().includes(namePart), ordinal);

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${raw}" to equip.` }); return; }
  if (!invItem.slot) { send(player.characterId, { type: 'error', content: `${invItem.name} cannot be equipped.` }); return; }

  if (invItem.slot === 'hand') {
    const hand = freeHand(player.characterId);
    if (!hand) { send(player.characterId, { type: 'error', content: 'Your hands are full. Unequip something first.' }); return; }
    db.prepare('UPDATE inventory SET equipped = 1, equipped_slot = ? WHERE id = ?').run(hand, invItem.id);
    const handLabel = hand === 'right_hand' ? 'right hand' : 'left hand';
    send(player.characterId, { type: 'text', content: `You hold ${invItem.name} in your ${handLabel}.` });
  } else {
    const existing = db.prepare(`
      SELECT inv.id, i.name FROM inventory inv JOIN items i ON inv.item_id = i.id
      WHERE inv.character_id = ? AND inv.equipped_slot = ?
    `).get(player.characterId, invItem.slot) as any;
    if (existing) {
      db.prepare('UPDATE inventory SET equipped = 0, equipped_slot = NULL WHERE id = ?').run(existing.id);
      send(player.characterId, { type: 'text', content: `You remove ${existing.name}.` });
    }
    db.prepare('UPDATE inventory SET equipped = 1, equipped_slot = ? WHERE id = ?').run(invItem.slot, invItem.id);
    const slotLabels: Record<string, string> = { torso: 'torso', head: 'head', feet: 'feet', legs: 'legs', back: 'back' };
    send(player.characterId, { type: 'text', content: `You wear ${invItem.name} (${slotLabels[invItem.slot] || invItem.slot}).` });
  }
}

// PUT command — "put X in Y" to place an item inside a container you own
function cmdPut(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Put what where? Usage: put <item> in <container>' }); return; }
  const raw = args.join(' ').toLowerCase();
  const inMatch = raw.match(/^(.+?)\s+in\s+(.+)$/);
  if (!inMatch) { send(player.characterId, { type: 'error', content: 'Usage: put <item> in <container>' }); return; }

  const itemName = inMatch[1].trim();
  const containerName = inMatch[2].trim();

  const container = db.prepare(`
    SELECT inv.id, inv.item_id, i.name, i.container_slots FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND lower(i.name) LIKE ? AND i.container_slots > 0 LIMIT 1
  `).get(player.characterId, `%${containerName}%`) as any;
  if (!container) { send(player.characterId, { type: 'error', content: `You don't have a container called "${inMatch[2].trim()}".` }); return; }

  const allInv = db.prepare(`
    SELECT inv.id, inv.item_id, inv.equipped, inv.container_id, i.name, i.size FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.id != ?
  `).all(player.characterId, container.id) as any[];
  const { ordinal, rest } = parseOrdinal(itemName);
  const namePart = rest || itemName;
  const invItem = pickByOrdinal(allInv, r => r.name.toLowerCase().includes(namePart) && !r.container_id, ordinal);
  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${inMatch[1].trim()}" to put away.` }); return; }
  if (invItem.id === container.id) { send(player.characterId, { type: 'error', content: `You can't put something inside itself.` }); return; }

  const usedSlots = db.prepare(`
    SELECT COALESCE(SUM(i.size), 0) as used FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.container_id = ?
  `).get(player.characterId, container.id) as any;
  const itemSize = invItem.size || 1;
  if ((usedSlots?.used || 0) + itemSize > container.container_slots) {
    send(player.characterId, { type: 'error', content: `Not enough room in ${container.name}. (${usedSlots?.used || 0}/${container.container_slots} slots used, item needs ${itemSize})` });
    return;
  }

  if (invItem.equipped) {
    db.prepare('UPDATE inventory SET equipped = 0, equipped_slot = NULL, container_id = ? WHERE id = ?').run(container.id, invItem.id);
    send(player.characterId, { type: 'text', content: `You unequip ${invItem.name} and put it in your ${container.name}.` });
  } else {
    db.prepare('UPDATE inventory SET container_id = ? WHERE id = ?').run(container.id, invItem.id);
    send(player.characterId, { type: 'text', content: `You put ${invItem.name} in your ${container.name}.` });
  }
}

// UNEQUIP command. Supports ordinal: "unequip second sword"
function cmdUnequip(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Unequip what?' }); return; }
  const raw = args.join(' ').trim();
  const { ordinal, rest } = parseOrdinal(raw);
  const namePart = (rest || raw).toLowerCase();
  const equipped = db.prepare(`
    SELECT inv.id, i.name FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped = 1
  `).all(player.characterId) as any[];
  const invItem = pickByOrdinal(equipped, r => r.name.toLowerCase().includes(namePart), ordinal);

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${raw}" equipped.` }); return; }
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

// Say to NPC (when user types "NPC Name: message") — matches dialogue options by keyword, then shop, then greeting
function cmdSayToNpc(player: OnlinePlayer, npc: any, message: string, send: SendFn): void {
  const msg = message.toLowerCase().trim();
  if (!msg) {
    send(player.characterId, { type: 'error', content: 'Say what?' });
    return;
  }

  const dialogueTree = JSON.parse(npc.dialogue_tree || '{}');
  const options: { keyword: string; label?: string; response: string }[] = dialogueTree.options || [];

  // "topics" or "help" → list keyword options the player can ask about
  if (msg === 'topics' || msg === 'help') {
    if (options.length === 0) {
      send(player.characterId, { type: 'text', content: `**${npc.name}** has no particular topics to discuss.` });
    } else {
      const lines = options.map((o: any) => `  **${o.keyword}** — ${o.label || o.keyword}`).join('\n');
      send(player.characterId, { type: 'text', content: `**${npc.name}** — topics you can ask about:\n\n${lines}\n\n*Say "${npc.name}: <keyword>" to ask (e.g. "${npc.name}: ${options[0].keyword}").*` });
    }
    return;
  }

  // Match dialogue option: message equals keyword or message contains keyword
  for (const opt of options) {
    const kw = (opt.keyword || '').toLowerCase().trim();
    if (!kw) continue;
    if (msg === kw || msg.includes(kw)) {
      const reply = opt.response || `${npc.name} has nothing specific to say about that.`;
      send(player.characterId, { type: 'text', content: `**${npc.name}** says: "${reply}"` });
      return;
    }
  }

  const shopInv = JSON.parse(npc.shop_inventory || '[]');
  const hasShop = shopInv.length > 0;

  if (hasShop && (msg.includes('sell') || msg.includes('buy') || msg.includes('price') || msg.includes('pay'))) {
    const invItems = db.prepare(`
      SELECT i.name, i.value FROM inventory inv JOIN items i ON inv.item_id = i.id
      WHERE inv.character_id = ? AND inv.equipped = 0
    `).all(player.characterId) as any[];
    const sellPrices = invItems.map((i: any) => `${i.name} (${Math.max(1, Math.floor(i.value * 0.5))}c)`);
    const reply = sellPrices.length > 0
      ? `Yes, I'll give you: ${sellPrices.join(', ')}.`
      : "You don't have anything I'm interested in.";
    send(player.characterId, { type: 'text', content: `**${npc.name}** says: "${reply}"` });
    return;
  }

  const greeting = dialogueTree.greeting || `${npc.name} nods. "What can I do for you?"`;
  const hint = options.length > 0
    ? `\n\n*You can ask about: ${options.map((o: any) => o.keyword).join(', ')}.*`
    : '';
  send(player.characterId, { type: 'text', content: `**${npc.name}** says: "${greeting}"${hint}` });
}

// Build numbered shop list for an NPC (index 1-based). Used for menu and buy-by-number.
function getShopListForNpc(npc: any): { index: number; item: any; price: number; name: string }[] {
  const shopInv = JSON.parse(npc.shop_inventory || '[]');
  const list: { index: number; item: any; price: number; name: string }[] = [];
  let index = 1;
  for (const entry of shopInv) {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(entry.item_id) as any;
    if (item) {
      const price = entry.price != null ? entry.price : (item.value ?? 0);
      list.push({ index: index++, item, price, name: item.name });
    }
  }
  return list;
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
    text += '\n*Type "menu" or "what are you selling" for a list. "buy <item or number>" to buy.*\n';
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

// BUY command (optional targetNpc: buy from that NPC only). Supports menu number ("buy 3") and ordinal+name ("buy second sword").
function cmdBuy(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn, targetNpc?: any): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Buy what?' }); return; }
  const raw = args.join(' ').trim();
  const npcs = targetNpc ? [targetNpc] : getRoomNpcs(player.roomId);

  for (const npc of npcs) {
    const shopList = getShopListForNpc(npc);
    if (shopList.length === 0) continue;

    let entry: { index: number; item: any; price: number; name: string } | null = null;
    const rawLower = raw.toLowerCase();
    if (/^\d+$/.test(raw.trim())) {
      const num = parseInt(raw.trim(), 10);
      entry = shopList.find(e => e.index === num) || null;
    } else {
      const { ordinal, rest } = parseOrdinal(raw);
      const namePart = rest || rawLower;
      entry = pickByOrdinal(shopList, e => e.name.toLowerCase().includes(namePart), ordinal);
    }

    if (!entry) continue;

    const { item, price, name } = entry;
    const char = getCharacter(player.characterId);
    const totalCopper = char.currency_copper + char.currency_silver * 100 + char.currency_gold * 10000;

    if (totalCopper < price) {
      send(player.characterId, { type: 'error', content: `You can't afford ${name} (${price}c).` });
      return;
    }

    const remaining = totalCopper - price;
    const gold = Math.floor(remaining / 10000);
    const silver = Math.floor((remaining % 10000) / 100);
    const copper = remaining % 100;
    db.prepare('UPDATE characters SET currency_gold = ?, currency_silver = ?, currency_copper = ? WHERE id = ?')
      .run(gold, silver, copper, player.characterId);

    db.prepare('INSERT INTO inventory (id, character_id, item_id, quantity) VALUES (?, ?, ?, 1)')
      .run(uuid(), player.characterId, item.id);

    send(player.characterId, { type: 'text', content: `You buy ${name} for ${price}c from ${npc.name}.` });
    return;
  }

  send(player.characterId, { type: 'error', content: targetNpc ? `${targetNpc.name} doesn't sell "${raw}".` : `No one here sells "${raw}".` });
}

// SELL command (optional targetNpc: sell to that NPC only). Supports ordinal: "sell second sword"
function cmdSell(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn, targetNpc?: any): void {
  if (args.length === 0) { send(player.characterId, { type: 'error', content: 'Sell what?' }); return; }
  const raw = args.join(' ').trim();
  const { ordinal, rest } = parseOrdinal(raw);
  const namePart = (rest || raw).toLowerCase();

  const npcs = getRoomNpcs(player.roomId);
  const npc = targetNpc || npcs.find((n: any) => JSON.parse(n.shop_inventory || '[]').length > 0);
  if (!npc) { send(player.characterId, { type: 'error', content: 'There is no merchant here.' }); return; }
  const hasShop = JSON.parse(npc.shop_inventory || '[]').length > 0;
  if (!hasShop) { send(player.characterId, { type: 'error', content: targetNpc ? `${npc.name} is not a merchant.` : 'There is no merchant here.' }); return; }

  const unequipped = db.prepare(`
    SELECT inv.id, i.name, i.value FROM inventory inv JOIN items i ON inv.item_id = i.id
    WHERE inv.character_id = ? AND inv.equipped = 0
  `).all(player.characterId) as any[];
  const invItem = pickByOrdinal(unequipped, r => r.name.toLowerCase().includes(namePart), ordinal);

  if (!invItem) { send(player.characterId, { type: 'error', content: `You don't have "${raw}" to sell.` }); return; }

  const sellPrice = Math.max(1, Math.floor(invItem.value * 0.5));
  db.prepare('DELETE FROM inventory WHERE id = ?').run(invItem.id);

  const char = getCharacter(player.characterId);
  let totalCopper = char.currency_copper + char.currency_silver * 100 + char.currency_gold * 10000 + sellPrice;
  const gold = Math.floor(totalCopper / 10000);
  const silver = Math.floor((totalCopper % 10000) / 100);
  const copper = totalCopper % 100;
  db.prepare('UPDATE characters SET currency_gold = ?, currency_silver = ?, currency_copper = ? WHERE id = ?')
    .run(gold, silver, copper, player.characterId);

  if (targetNpc) {
    const g = Math.floor(sellPrice / 10000), s = Math.floor((sellPrice % 10000) / 100), c = sellPrice % 100;
    const amountStr = [g ? `${g}g` : '', s ? `${s}s` : '', c ? `${c}c` : ''].filter(Boolean).join(' ') || '0c';
    send(player.characterId, { type: 'text', content: `You receive ${amountStr} from **${npc.name}**.` });
    send(player.characterId, { type: 'text', content: `**${npc.name}** says: "Thanks! These will make a tasty meal!"` });
  } else {
    send(player.characterId, { type: 'text', content: `You sell ${invItem.name} for ${sellPrice}c.` });
  }
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
    const raw = args.join(' ').trim();
    const { ordinal, rest } = parseOrdinal(raw);
    const namePart = rest || raw.toLowerCase();
    const found = pickByOrdinal(creatures, c => c.name.toLowerCase().includes(namePart), ordinal);
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
    WHERE inv.character_id = ? AND inv.equipped = 1 AND inv.equipped_slot IN ('right_hand','left_hand') AND i.category = 'weapon' LIMIT 1
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
        db.prepare("UPDATE character_quests SET state = ?, started_at = datetime('now') WHERE character_id = ? AND quest_id = ?")
          .run('active', player.characterId, questId);
      } else {
        db.prepare("INSERT INTO character_quests (character_id, quest_id, state, progress, started_at) VALUES (?, ?, ?, ?, datetime('now'))")
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
**Doors:** go <place>, go door, go first door, go second door…
**Interact:** enter <place>, climb <object>, open <object>
**Actions:** look [target], peer <exit/door>, talk <npc>, buy <item>, sell <item>, forage, fish
**Combat:** attack [target], flee, defend
**Items:** inventory/inv, get <item>, drop <item>, equip <item>, unequip <item>
**Containers:** look in <container>, put <item> in <container>, get <item> from <container>
**Social:** "message" or 'message' (say out loud), say <msg>, whisper <name> <msg>, party invite/leave/list, who
**Info:** status, skills, quests, accept <quest>, help, map
**Other:** invite <email>, report <player> <reason>`;

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
  const gates = getRoomGates(player.roomId);

  let text = `**Map — ${region?.name || 'Unknown'}**\n\n`;
  text += `You are at: ${room?.title}\n`;
  if (exits.length > 0) {
    text += `Exits:\n`;
    for (const exit of exits) {
      const destRoom = getRoomData(exit.to_room_id);
      text += `  ${exit.direction} → ${destRoom?.title || 'Unknown'}\n`;
    }
  }
  if (gates.length > 0) {
    text += `Doors:\n`;
    for (let i = 0; i < gates.length; i++) {
      const gate = gates[i];
      const destRoom = getRoomData(gate.to_room_id);
      const keywords = (gate.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean);
      const label = keywords.find((k: string) => k !== 'door' && k !== 'back' && k !== 'out') || keywords[0];
      text += `  go ${label} → ${destRoom?.title || 'Unknown'}\n`;
    }
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

// Skill XP helper (skillId can be GUID or skill_key)
function awardSkillXP(characterId: string, skillIdOrKey: string, amount: number, send: SendFn): void {
  let skillId = skillIdOrKey;
  const byKey = db.prepare('SELECT id FROM skills WHERE skill_key = ?').get(skillIdOrKey) as any;
  if (byKey) skillId = byKey.id;
  const existing = db.prepare('SELECT * FROM character_skills WHERE character_id = ? AND skill_id = ?')
    .get(characterId, skillId) as any;

  if (!existing) {
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
            db.prepare("UPDATE character_quests SET state = ?, progress = ?, completed_at = datetime('now') WHERE character_id = ? AND quest_id = ?")
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

// Room spawn checker — returns the spawned creature if any, so caller can broadcast "enters"
function checkRoomSpawns(roomId: string): LiveCreature | null {
  const room = getRoomData(roomId);
  if (!room?.spawn_table_id) return null;

  const existing = gameState.getCreaturesInRoom(roomId);
  const table = db.prepare('SELECT * FROM spawn_tables WHERE id = ?').get(room.spawn_table_id) as any;
  if (!table) return null;

  const entries = JSON.parse(table.entries || '[]');
  if (existing.length >= table.max_concurrent) return null;

  const lastSpawn = gameState.roomSpawnTimers.get(roomId) || 0;
  if (Date.now() - lastSpawn < table.respawn_seconds * 1000) return null;

  // Spawn one random creature
  const entry = entries[Math.floor(Math.random() * entries.length)];
  if (entry) {
    const spawned = gameState.spawnCreature(entry.creature_id, roomId);
    gameState.roomSpawnTimers.set(roomId, Date.now());
    return spawned;
  }
  return null;
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

// INVITE command — send an email invite to another player
function cmdInvite(player: OnlinePlayer, args: string[], send: SendFn, broadcast: BroadcastFn): void {
  const email = args[0]?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    send(player.characterId, { type: 'error', content: 'Usage: **invite email@example.com**' });
    return;
  }
  const existingAccount = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
  if (existingAccount) {
    send(player.characterId, { type: 'error', content: 'That email already has an account.' });
    return;
  }
  const existingInvite = db.prepare('SELECT id FROM invites WHERE email = ? AND accepted = 0').get(email);
  if (existingInvite) {
    send(player.characterId, { type: 'system', content: 'An invite has already been sent to that email.' });
    return;
  }
  const token = uuid();
  db.prepare('INSERT INTO invites (id, email, token, invited_by) VALUES (?, ?, ?, ?)').run(uuid(), email, token, player.characterId);

  // Send the email asynchronously
  const { sendInviteEmail } = require('../email');
  sendInviteEmail(email, token, player.characterName).then((ok: boolean) => {
    if (ok) {
      send(player.characterId, { type: 'system', content: `Invite sent to **${email}**!` });
    } else {
      send(player.characterId, { type: 'error', content: `Failed to send invite email. Check server email configuration.` });
    }
  });
}

// REPORT command — report another player
function cmdReport(player: OnlinePlayer, args: string[], send: SendFn, _broadcast: BroadcastFn): void {
  if (args.length < 2) {
    send(player.characterId, { type: 'error', content: 'Usage: **report <player name> <reason>**' });
    return;
  }
  const targetName = args[0];
  const reason = args.slice(1).join(' ').trim();
  if (!reason) {
    send(player.characterId, { type: 'error', content: 'Please include a reason for the report.' });
    return;
  }

  const target = db.prepare('SELECT id, account_id, name FROM characters WHERE LOWER(name) = ?').get(targetName.toLowerCase()) as any;
  if (!target) {
    send(player.characterId, { type: 'error', content: `No player named "${targetName}" found.` });
    return;
  }
  if (target.id === player.characterId) {
    send(player.characterId, { type: 'error', content: 'You cannot report yourself.' });
    return;
  }

  db.prepare('INSERT INTO reports (id, reporter_character_id, target_account_id, target_character_name, reason) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), player.characterId, target.account_id, target.name, reason);

  send(player.characterId, { type: 'system', content: `Your report against **${target.name}** has been submitted. Thank you.` });
}

// PEER command — look through an exit/door and print the room description in the game log
function cmdPeer(player: OnlinePlayer, args: string[], send: SendFn, _broadcast: BroadcastFn): void {
  const input = args.join(' ').trim().toLowerCase();
  if (!input) {
    send(player.characterId, { type: 'error', content: 'Peer where? (e.g. **peer north**, **peer door**)' });
    return;
  }

  let toRoomId: string | null = null;

  // 1) Try cardinal exit
  const direction = DIR_ALIASES[input] || input;
  const exits = getRoomExits(player.roomId);
  const exit = exits.find((e: any) => e.direction === direction);
  if (exit) {
    toRoomId = exit.to_room_id;
  }

  // 2) Try gate keyword
  if (!toRoomId) {
    const gatePhrase = args.join(' ').toLowerCase().trim();
    const { ordinal, rest: basePhrase } = parseOrdinal(gatePhrase);
    const searchPhrase = basePhrase || gatePhrase;
    const gates = getRoomGates(player.roomId);
    const matchingGates = gates.filter((g: any) => {
      const keywords = (g.keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      return keywords.some((k: string) => k === searchPhrase || searchPhrase.includes(k) || k.includes(searchPhrase));
    });
    if (matchingGates.length === 0) {
      const exactGate = gates.find((g: any) => {
        const keywords = (g.keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
        return keywords.some((k: string) => k === gatePhrase || gatePhrase.includes(k) || k.includes(gatePhrase));
      });
      if (exactGate) toRoomId = exactGate.to_room_id;
    } else {
      const idx = ordinal != null ? ordinal - 1 : 0;
      const gate = matchingGates[idx];
      if (gate) toRoomId = gate.to_room_id;
    }
  }

  if (!toRoomId) {
    send(player.characterId, { type: 'error', content: "You don't see that exit or door here." });
    return;
  }

  const room = getRoomData(toRoomId) as any;
  if (!room) {
    send(player.characterId, { type: 'error', content: 'You cannot make out what lies that way.' });
    return;
  }

  const desc = room.description_long || room.description_short || '(Nothing notable.)';
  send(player.characterId, { type: 'text', content: `*Peering through:*\n\n**${room.title}**\n${desc}` });
}

// Command registry
const COMMANDS: Record<string, CommandHandler> = {
  look: cmdLook, l: cmdLook,
  say: cmdSay, "'": cmdSay,
  whisper: cmdWhisper, tell: cmdWhisper,
  inventory: cmdInventory, inv: cmdInventory, i: cmdInventory,
  get: cmdGet, take: cmdGet,
  drop: cmdDrop,
  put: cmdPut, stash: cmdPut, store: cmdPut,
  equip: cmdEquip, wear: cmdEquip, wield: cmdEquip,
  unequip: cmdUnequip, remove: cmdUnequip,
  status: cmdStatus, score: cmdStatus, stat: cmdStatus,
  skills: cmdSkills,
  talk: cmdTalk, speak: cmdTalk,
  buy: cmdBuy, purchase: cmdBuy,
  sell: cmdSell,
  attack: cmdAttack, kill: cmdAttack, hit: cmdAttack, k: cmdAttack,
  climb: (p, a, s, b) => cmdInteract(p, a, s, b, 'climb'),
  enter: (p, a, s, b) => cmdInteract(p, a, s, b, 'enter'),
  open: (p, a, s, b) => cmdInteract(p, a, s, b, 'open'),
  flee: cmdFlee, run: cmdFlee,
  quests: cmdQuests, quest: cmdQuests,
  accept: cmdAccept,
  forage: cmdForage, gather: cmdForage,
  fish: cmdFish,
  help: cmdHelp, '?': cmdHelp,
  who: cmdWho,
  map: cmdMap,
  party: cmdParty, group: cmdParty,
  invite: cmdInvite,
  report: cmdReport,
  peer: cmdPeer,
};

// Add direction commands
for (const [alias, dir] of Object.entries(DIR_ALIASES)) {
  if (!COMMANDS[alias]) {
    COMMANDS[alias] = (player, args, send, broadcast) => cmdMove(player, [dir], send, broadcast);
  }
}
COMMANDS['go'] = cmdMove;
COMMANDS['move'] = cmdMove;
// Ensure peer is registered (defensive; avoids stale bundles missing the key)
COMMANDS.peer = cmdPeer;
COMMANDS.glance = cmdPeer;

export function processCommand(input: string, player: OnlinePlayer, send: SendFn, broadcast: BroadcastFn): void {
  const trimmed = input.trim();
  if (!trimmed) return;

  // Say out loud: "message" or 'message' — broadcast to room
  const first = trimmed[0];
  if (first === '"' || first === "'") {
    const closeIdx = trimmed.indexOf(first, 1);
    const message = closeIdx > 0 ? trimmed.slice(1, closeIdx) : trimmed.slice(1);
    if (message.length > 0) {
      cmdSay(player, [message], send, broadcast);
    } else {
      send(player.characterId, { type: 'error', content: 'Say what?' });
    }
    return;
  }

  // "NPC Name: rest" — directed at NPC (from clicking NPC bubble)
  const npcs = getRoomNpcs(player.roomId);
  const sortedNpcs = [...npcs].sort((a, b) => (b.name.length - a.name.length));
  for (const npc of sortedNpcs) {
    const prefix = npc.name + ': ';
    if (trimmed.length >= prefix.length && trimmed.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
      const rest = trimmed.slice(prefix.length).trim();
      if (!rest) { send(player.characterId, { type: 'error', content: 'Say what?' }); return; }
      if (rest.toLowerCase().startsWith('sell ')) {
        cmdSell(player, rest.slice(5).trim().split(/\s+/), send, broadcast, npc);
        return;
      }
      if (rest.toLowerCase().startsWith('buy ')) {
        cmdBuy(player, rest.slice(4).trim().split(/\s+/), send, broadcast, npc);
        return;
      }
      const restLower = rest.toLowerCase().trim();
      const menuPhrases = ['menu', 'what are you selling', 'what do you sell', 'list', 'wares', 'goods', 'what do you have'];
      const askingMenu = menuPhrases.some(p => restLower === p || restLower.startsWith(p + ' '));
      if (askingMenu && JSON.parse(npc.shop_inventory || '[]').length > 0) {
        const shopList = getShopListForNpc(npc);
        if (shopList.length === 0) {
          send(player.characterId, { type: 'text', content: `**${npc.name}** says: "I have nothing in stock at the moment."` });
        } else {
          let lines = shopList.map(e => `${e.index}. ${e.name} — ${e.price}c`).join('\n');
          send(player.characterId, { type: 'text', content: `**${npc.name}** says: "Here's what I have."\n\n${lines}\n\n*Say "buy <number or item>" to purchase.*` });
        }
        return;
      }
      cmdSayToNpc(player, npc, rest, send);
      return;
    }
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/^\/+/, '');
  const args = parts.slice(1);

  const handler = COMMANDS[cmd];
  if (handler) {
    handler(player, args, send, broadcast);
  } else if (cmd === 'peer' || cmd === 'glance') {
    cmdPeer(player, args, send, broadcast);
  } else {
    send(player.characterId, { type: 'error', content: `Unknown command: "${cmd}". Type "help" for commands.` });
  }
}

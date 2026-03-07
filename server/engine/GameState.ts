import { v4 as uuid } from 'uuid';
import db from '../db';

/** Tracks all online players and live game state in memory */

export interface OnlinePlayer {
  characterId: string;
  accountId: string;
  characterName: string;
  roomId: string;
  ws: any; // WebSocket reference
  combatTarget: string | null;
  combatCooldown: number;
  lastAction: number;
  partyId: string | null;
}

export interface LiveCreature {
  instanceId: string;
  creatureId: string;
  name: string;
  roomId: string;
  health: number;
  healthMax: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  accuracy: number;
  dodge: number;
  attackSpeed: number;
  behavior: string;
  lootTable: any[];
  experienceReward: number;
  combatTarget: string | null;
  lastAttack: number;
  spawnTime: number;
}

export interface Party {
  id: string;
  leaderId: string;
  memberIds: string[];
}

class GameState {
  players: Map<string, OnlinePlayer> = new Map(); // characterId -> OnlinePlayer
  creatures: Map<string, LiveCreature> = new Map(); // instanceId -> LiveCreature
  parties: Map<string, Party> = new Map();
  roomSpawnTimers: Map<string, number> = new Map(); // roomId -> next spawn time

  addPlayer(player: OnlinePlayer): void {
    this.players.set(player.characterId, player);
  }

  removePlayer(characterId: string): void {
    const player = this.players.get(characterId);
    if (player?.partyId) {
      this.removeFromParty(characterId, player.partyId);
    }
    this.players.delete(characterId);
  }

  getPlayer(characterId: string): OnlinePlayer | undefined {
    return this.players.get(characterId);
  }

  getPlayersInRoom(roomId: string): OnlinePlayer[] {
    const result: OnlinePlayer[] = [];
    for (const p of this.players.values()) {
      if (p.roomId === roomId) result.push(p);
    }
    return result;
  }

  getCreaturesInRoom(roomId: string): LiveCreature[] {
    const result: LiveCreature[] = [];
    for (const c of this.creatures.values()) {
      if (c.roomId === roomId) result.push(c);
    }
    return result;
  }

  spawnCreature(creatureId: string, roomId: string): LiveCreature | null {
    const template = db.prepare('SELECT * FROM creatures WHERE id = ?').get(creatureId) as any;
    if (!template) return null;

    const instance: LiveCreature = {
      instanceId: uuid(),
      creatureId: template.id,
      name: template.name,
      roomId,
      health: template.health_max,
      healthMax: template.health_max,
      attackMin: template.attack_min,
      attackMax: template.attack_max,
      defense: template.defense,
      accuracy: template.accuracy,
      dodge: template.dodge,
      attackSpeed: template.attack_speed,
      behavior: template.behavior,
      lootTable: JSON.parse(template.loot_table || '[]'),
      experienceReward: template.experience_reward,
      combatTarget: null,
      lastAttack: 0,
      spawnTime: Date.now(),
    };
    this.creatures.set(instance.instanceId, instance);
    return instance;
  }

  removeCreature(instanceId: string): void {
    this.creatures.delete(instanceId);
  }

  createParty(leaderId: string): Party {
    const party: Party = { id: uuid(), leaderId, memberIds: [leaderId] };
    this.parties.set(party.id, party);
    const player = this.players.get(leaderId);
    if (player) player.partyId = party.id;
    return party;
  }

  joinParty(characterId: string, partyId: string): boolean {
    const party = this.parties.get(partyId);
    if (!party || party.memberIds.length >= 6) return false;
    if (party.memberIds.includes(characterId)) return false;
    party.memberIds.push(characterId);
    const player = this.players.get(characterId);
    if (player) player.partyId = partyId;
    return true;
  }

  removeFromParty(characterId: string, partyId: string): void {
    const party = this.parties.get(partyId);
    if (!party) return;
    party.memberIds = party.memberIds.filter(id => id !== characterId);
    const player = this.players.get(characterId);
    if (player) player.partyId = null;
    if (party.memberIds.length === 0) {
      this.parties.delete(partyId);
    } else if (party.leaderId === characterId) {
      party.leaderId = party.memberIds[0];
    }
  }
}

export const gameState = new GameState();

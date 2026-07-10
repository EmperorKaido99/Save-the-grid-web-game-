// Defense definitions — portable data, no rendering code
// Each defense has 3 upgrade levels
export const DEFENSE_TYPES = {
  SOLAR_PANEL: {
    id: 'SOLAR_PANEL',
    name: 'Solar Panel',
    description: 'Generates KW. Upgraded panels divert energy to heal the station.',
    color: 0x2255cc,
    panelColor: 0x1a3d8f,
    category: 'energy',
    levels: [
      { cost: 40,  health: 80,  damage: 12, range: 10, attackCooldown: 1.2, kwPerSecond: 3,  healPerSecond: 0 },
      { cost: 60,  health: 120, damage: 18, range: 12, attackCooldown: 1.0, kwPerSecond: 5,  healPerSecond: 2 },
      { cost: 100, health: 160, damage: 25, range: 14, attackCooldown: 0.8, kwPerSecond: 8,  healPerSecond: 5 },
    ],
  },
  WIND_TURBINE: {
    id: 'WIND_TURBINE',
    name: 'Wind Turbine',
    description: 'High KW output. AOE shockwave damages groups of enemies.',
    color: 0xdddddd,
    panelColor: 0xeeeeee,
    category: 'energy',
    levels: [
      { cost: 80,  health: 120, damage: 22, range: 14, attackCooldown: 2.0, kwPerSecond: 6,  healPerSecond: 0 },
      { cost: 120, health: 180, damage: 35, range: 16, attackCooldown: 1.6, kwPerSecond: 10, healPerSecond: 0 },
      { cost: 180, health: 250, damage: 50, range: 18, attackCooldown: 1.2, kwPerSecond: 15, healPerSecond: 0 },
    ],
  },
  TURRET: {
    id: 'TURRET',
    name: 'Turret',
    description: 'Pure firepower. Fast-firing defense with no KW generation.',
    color: 0x667788,
    panelColor: 0x556677,
    category: 'combat',
    levels: [
      { cost: 60,  health: 100, damage: 20, range: 12, attackCooldown: 0.8, kwPerSecond: 0, healPerSecond: 0 },
      { cost: 90,  health: 160, damage: 35, range: 14, attackCooldown: 0.6, kwPerSecond: 0, healPerSecond: 0 },
      { cost: 150, health: 220, damage: 55, range: 16, attackCooldown: 0.4, kwPerSecond: 0, healPerSecond: 0 },
    ],
  },
  FENCE: {
    id: 'FENCE',
    name: 'Fence',
    description: 'Blocks enemy paths. Level 3 becomes electrified — zaps on contact!',
    color: 0x888888,
    panelColor: 0x666666,
    category: 'barrier',
    levels: [
      { cost: 20,  health: 80,   damage: 0,  range: 0,   attackCooldown: 0, kwPerSecond: 0, healPerSecond: 0, electric: false },
      { cost: 35,  health: 140,  damage: 0,  range: 0,   attackCooldown: 0, kwPerSecond: 0, healPerSecond: 0, electric: false },
      { cost: 70,  health: 200,  damage: 8,  range: 2.5, attackCooldown: 0.5, kwPerSecond: 0, healPerSecond: 0, electric: true },
    ],
  },
};

export const DEFENSE_LIST = Object.values(DEFENSE_TYPES);

// Get stats for a defense at a given level (0-indexed)
export function getDefenseStats(typeId, level) {
  const def = DEFENSE_TYPES[typeId];
  if (!def) return null;
  return def.levels[Math.min(level, def.levels.length - 1)];
}

// Get upgrade cost (cost of next level)
export function getUpgradeCost(typeId, currentLevel) {
  const def = DEFENSE_TYPES[typeId];
  if (!def) return null;
  const nextLevel = currentLevel + 1;
  if (nextLevel >= def.levels.length) return null; // max level
  return def.levels[nextLevel].cost;
}

export const MAX_LEVEL = 3; // levels are 1-indexed for display (internally 0-2)

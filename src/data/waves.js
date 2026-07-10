// Wave definitions — 5 waves for demo scope
// Each wave: array of spawn groups with delay offsets
export const WAVES = [
  {
    id: 1,
    name: 'The Scouts',
    announcement: 'A few opportunists are testing the fence...',
    spawns: [
      { type: 'LOOTER', count: 3, delay: 0, interval: 1.5 },
      { type: 'LOOTER', count: 2, delay: 6, interval: 1.5 },
    ],
  },
  {
    id: 2,
    name: 'Copper Rush',
    announcement: 'Word got out about the copper wiring...',
    spawns: [
      { type: 'LOOTER', count: 4, delay: 0, interval: 1.2 },
      { type: 'CABLE_THIEF', count: 3, delay: 4, interval: 1.0 },
    ],
  },
  {
    id: 3,
    name: 'Organised Chaos',
    announcement: 'They\'re coming from all sides now!',
    spawns: [
      { type: 'LOOTER', count: 5, delay: 0, interval: 1.0 },
      { type: 'CABLE_THIEF', count: 4, delay: 3, interval: 0.8 },
      { type: 'VANDAL', count: 1, delay: 8, interval: 0 },
    ],
  },
  {
    id: 4,
    name: 'The Heavy Crew',
    announcement: 'They brought the heavy hitters...',
    spawns: [
      { type: 'VANDAL', count: 3, delay: 0, interval: 3.0 },
      { type: 'CABLE_THIEF', count: 5, delay: 2, interval: 0.7 },
      { type: 'LOOTER', count: 6, delay: 5, interval: 0.8 },
    ],
  },
  {
    id: 5,
    name: 'Full Blackout',
    announcement: 'Everything they\'ve got — hold the grid!',
    spawns: [
      { type: 'LOOTER', count: 8, delay: 0, interval: 0.6 },
      { type: 'CABLE_THIEF', count: 6, delay: 2, interval: 0.6 },
      { type: 'VANDAL', count: 4, delay: 5, interval: 2.0 },
    ],
  },
];

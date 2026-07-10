import { WAVES } from './data/waves.js';

// Controls wave spawning and progression
export class WaveManager {
  constructor() {
    this.currentWaveIndex = 0;
    this.spawning = false;
    this.spawnQueue = [];   // { type, spawnAt }
    this.elapsed = 0;
    this.totalSpawned = 0;
    this.totalToSpawn = 0;
  }

  get currentWave() {
    return WAVES[this.currentWaveIndex] || null;
  }

  get waveNumber() {
    return this.currentWaveIndex + 1;
  }

  get totalWaves() {
    return WAVES.length;
  }

  get isLastWave() {
    return this.currentWaveIndex >= WAVES.length - 1;
  }

  get hasMoreWaves() {
    return this.currentWaveIndex < WAVES.length;
  }

  startWave() {
    const wave = this.currentWave;
    if (!wave) return false;

    this.spawning = true;
    this.elapsed = 0;
    this.totalSpawned = 0;
    this.spawnQueue = [];

    // Build spawn schedule
    for (const group of wave.spawns) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          type: group.type,
          spawnAt: group.delay + i * group.interval,
        });
      }
    }

    // Sort by spawn time
    this.spawnQueue.sort((a, b) => a.spawnAt - b.spawnAt);
    this.totalToSpawn = this.spawnQueue.length;
    return true;
  }

  // Returns array of enemy type IDs to spawn this frame
  update(dt) {
    if (!this.spawning) return [];

    this.elapsed += dt;
    const toSpawn = [];

    while (this.spawnQueue.length > 0 && this.spawnQueue[0].spawnAt <= this.elapsed) {
      const entry = this.spawnQueue.shift();
      toSpawn.push(entry.type);
      this.totalSpawned++;
    }

    // Done spawning when queue is empty
    if (this.spawnQueue.length === 0) {
      this.spawning = false;
    }

    return toSpawn;
  }

  advanceWave() {
    this.currentWaveIndex++;
  }

  reset() {
    this.currentWaveIndex = 0;
    this.spawning = false;
    this.spawnQueue = [];
    this.elapsed = 0;
  }
}

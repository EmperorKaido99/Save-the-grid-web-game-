import * as THREE from 'three';
import { ENEMY_TYPES } from './data/enemies.js';
import { Models } from './ModelLoader.js';

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.spawnDistance = 50;   // how far from station
    this.spawnWidth = 40;     // lateral spread
  }

  spawn(typeId) {
    const def = ENEMY_TYPES[typeId];
    if (!def) return;

    const group = new THREE.Group();

    // Try to load the real model, fallback to primitive
    const modelKey = typeId === 'LOOTER' ? 'looter' :
                     typeId === 'CABLE_THIEF' ? 'cableThief' : null;
    const model = modelKey ? Models.getClone(modelKey) : null;

    if (model) {
      // Scale models to match game units
      const scaleMap = { looter: 0.8, cableThief: 0.02 };
      model.scale.setScalar(scaleMap[modelKey] || 1.0);
      model.name = 'model';
      group.add(model);
    } else {
      // Fallback primitive
      const bodyH = 1.4 * def.scale;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35 * def.scale, 0.45 * def.scale, bodyH, 8),
        new THREE.MeshStandardMaterial({ color: def.color })
      );
      body.position.y = bodyH / 2 + 0.1;
      body.castShadow = true;
      group.add(body);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3 * def.scale, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xccaa88 })
      );
      head.position.y = bodyH + 0.4 * def.scale;
      head.castShadow = true;
      group.add(head);

      if (typeId === 'CABLE_THIEF') {
        const mask = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32 * def.scale, 0.32 * def.scale, 0.2, 8),
          new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        mask.position.y = bodyH + 0.5 * def.scale;
        group.add(mask);
      }
      if (typeId === 'VANDAL') {
        const ham = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 1.2, 0.15),
          new THREE.MeshStandardMaterial({ color: 0x553311 })
        );
        ham.position.set(0.5, 1.0, 0);
        group.add(ham);
        const hamHead = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.25, 0.25),
          new THREE.MeshStandardMaterial({ color: 0x666666 })
        );
        hamHead.position.set(0.5, 1.65, 0);
        group.add(hamHead);
      }
    }

    // Health bar
    const hbBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide })
    );
    hbBg.position.y = bodyH + 0.9 * def.scale;
    group.add(hbBg);

    const hbFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide })
    );
    hbFill.position.y = bodyH + 0.9 * def.scale;
    hbFill.position.z = 0.01;
    group.add(hbFill);

    // Spawn from one direction (negative Z — approaching from the front)
    // The camera looks toward -Z, so enemies come from that direction
    const xSpread = (Math.random() - 0.5) * this.spawnWidth;
    const zJitter = Math.random() * 5;
    group.position.set(xSpread, 0, -(this.spawnDistance + zJitter));

    this.scene.add(group);

    const enemy = {
      id: crypto.randomUUID(),
      type: typeId,
      def,
      group,
      hbFill,
      health: def.health,
      maxHealth: def.health,
      attackTimer: 0,
      target: null,         // set by AI each frame
      stunTimer: 0,
      alive: true,
      rewardCredited: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  update(dt, defenses, station) {
    for (const e of this.enemies) {
      if (!e.alive) continue;

      // Stun recovery
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        // Visual stun effect — flicker
        e.group.visible = Math.floor(e.stunTimer * 10) % 2 === 0;
        continue;
      }
      e.group.visible = true;

      // Check if a fence is blocking the path — attack it first
      let blockingFence = null;
      for (const d of defenses) {
        if (!d.alive || d.type !== 'FENCE') continue;
        const fenceDist = e.group.position.distanceTo(d.group.position);
        if (fenceDist < 3.0) {
          blockingFence = d;
          break;
        }
      }

      // Pick target
      let targetPos;
      if (blockingFence) {
        // Fence blocks path — must destroy it first
        e.target = blockingFence;
        targetPos = blockingFence.group.position;
      } else if (e.def.targetsDefenses && defenses.length > 0) {
        // Cable thieves go for nearest defense
        let nearest = null;
        let nearDist = Infinity;
        for (const d of defenses) {
          if (!d.alive) continue;
          const dist = e.group.position.distanceTo(d.group.position);
          if (dist < nearDist) {
            nearDist = dist;
            nearest = d;
          }
        }
        if (nearest) {
          e.target = nearest;
          targetPos = nearest.group.position;
        } else {
          targetPos = station.position;
          e.target = null;
        }
      } else {
        targetPos = station.position;
        e.target = null;
      }

      // Move toward target
      const dir = new THREE.Vector3().subVectors(targetPos, e.group.position);
      dir.y = 0;
      const dist = dir.length();

      if (dist > 1.5) {
        dir.normalize();
        e.group.position.addScaledVector(dir, e.def.speed * dt);
        e.group.rotation.y = Math.atan2(dir.x, dir.z);
      } else {
        // In range — attack
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          e.attackTimer = e.def.attackCooldown;
          if (e.target && e.target.alive) {
            e.target.health -= e.def.damage;
          } else {
            // Attack station
            station.health -= e.def.damage;
          }
        }
      }

      // Update health bar
      const ratio = Math.max(0, e.health / e.maxHealth);
      e.hbFill.scale.x = ratio;
      e.hbFill.position.x = -(1.18 * (1 - ratio)) / 2;
    }
  }

  // Deal damage to enemies in range of a point
  damageInRadius(point, radius, damage) {
    const hits = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dist = e.group.position.distanceTo(point);
      if (dist <= radius) {
        e.health -= damage;
        e.stunTimer = 0.4; // brief stun
        if (e.health <= 0) {
          e.alive = false;
          e.group.visible = false;
          hits.push(e);
        }
      }
    }
    return hits;
  }

  // Find nearest enemy to a point within range
  findNearest(point, range) {
    let nearest = null;
    let nearDist = range;
    for (const e of this.enemies) {
      if (!e.alive || e.stunTimer > 0) continue;
      const dist = e.group.position.distanceTo(point);
      if (dist < nearDist) {
        nearDist = dist;
        nearest = e;
      }
    }
    return nearest;
  }

  // Collect KW rewards for all kills not yet credited (defense kills + AOE kills)
  collectUnrewardedKills() {
    const kills = [];
    for (const e of this.enemies) {
      if (!e.alive && !e.rewardCredited) {
        e.rewardCredited = true;
        kills.push(e);
      }
    }
    return kills;
  }

  get aliveCount() {
    return this.enemies.filter(e => e.alive).length;
  }

  clearAll() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
    }
    this.enemies = [];
  }
}

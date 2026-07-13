import * as THREE from 'three';
import { ENEMY_TYPES } from './data/enemies.js';
import { Models } from './ModelLoader.js';
import { CharacterAnimator } from './AnimationSystem.js';

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.lootObjects = [];    // dropped loot from destroyed defenses
    this.spawnDistance = 50;   // how far from station
    this.spawnWidth = 40;     // lateral spread
  }

  spawn(typeId) {
    const def = ENEMY_TYPES[typeId];
    if (!def) return;

    const group = new THREE.Group();

    // bodyH used for health-bar placement — set a default for loaded models
    let bodyH = 1.4 * def.scale;

    // Try to load the real model, fallback to primitive
    const modelKey = typeId === 'LOOTER' ? 'looter' :
                     typeId === 'CABLE_THIEF' ? 'cableThief' :
                     typeId === 'VANDAL' ? 'vandal' : null;
    const model = modelKey ? Models.getClone(modelKey) : null;

    if (model) {
      // ModelLoader normalizes to ~2.4 units tall; apply per-type size ratio
      model.scale.setScalar(def.scale);
      model.name = 'model';
      group.add(model);
      bodyH = 2.0 * def.scale; // health bar sits above the normalized model
    } else {
      // Fallback primitive
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
      animator: null,
      climb: null,          // active fence-vault state (cable thieves)
      deathTimer: 0,        // keeps the body visible while a death clip plays
    };
    this.enemies.push(enemy);

    // Wire animation clips loaded by ModelLoader (FBX Mixamo clips + embedded)
    if (model) {
      const clips = Models.getClips(modelKey);
      const embedded = Models.getAnimations(modelKey);
      const animator = new CharacterAnimator(model, clips, embedded);
      if (animator.hasAnyClip) {
        enemy.animator = animator;
        enemy.groundTimer = 0.25; // calibrate feet once the clip is posing
      }
    }
    return enemy;
  }

  // One-time ground calibration: some walk clips carry the hips at a
  // different height than the model's bind pose, leaving the character
  // hovering. Once the animation is posing the skeleton, measure the
  // lowest foot bone and drop the model so the feet touch the ground.
  _groundFeet(e) {
    const model = e.group.getObjectByName('model');
    if (!model) return;
    let minY = Infinity;
    e.group.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    e.group.traverse(o => {
      if (o.isBone && /toe|foot|ankle/i.test(o.name)) {
        o.getWorldPosition(v);
        minY = Math.min(minY, v.y - e.group.position.y);
      }
    });
    if (minY === Infinity) return;
    // leave ~4cm for the sole; only correct meaningful offsets
    const correction = minY - 0.04;
    if (Math.abs(correction) > 0.05 && Math.abs(correction) < 2) {
      model.position.y -= correction;
    }
  }

  update(dt, defenses, station) {
    for (const e of this.enemies) {
      if (!e.alive) {
        // Let a death clip finish before the body disappears
        if (e.deathTimer > 0) {
          e.deathTimer -= dt;
          if (e.animator) e.animator.update(dt);
          if (e.deathTimer <= 0) e.group.visible = false;
        }
        continue;
      }

      // Stun recovery
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        // Visual stun effect — flicker
        e.group.visible = Math.floor(e.stunTimer * 10) % 2 === 0;
        continue;
      }
      e.group.visible = true;

      // Active fence vault (cable thieves) — arc over on a fixed path so
      // the landing spot is always predictable (no root-motion drift)
      if (e.climb) {
        e.climb.t += dt;
        const k = Math.min(1, e.climb.t / e.climb.dur);
        e.group.position.lerpVectors(e.climb.from, e.climb.to, k);
        e.group.position.y = Math.sin(Math.PI * k) * 2.4;
        if (e.animator) {
          e.animator.setState('climb', ['run', 'walk'], 1);
          e.animator.update(dt);
        }
        if (k >= 1) {
          e.group.position.y = 0;
          e.climb = null;
        }
        continue;
      }

      // Check if a fence is blocking the path
      let blockingFence = null;
      for (const d of defenses) {
        if (!d.alive || d.type !== 'FENCE') continue;
        const fenceDist = e.group.position.distanceTo(d.group.position);
        if (fenceDist < 3.0) {
          blockingFence = d;
          break;
        }
      }

      // Climbers vault the fence instead of destroying it
      if (blockingFence && e.def.fenceBehavior === 'climb') {
        const dir = new THREE.Vector3()
          .subVectors(blockingFence.group.position, e.group.position);
        dir.y = 0;
        const distToFence = dir.length();
        dir.normalize();
        const from = e.group.position.clone();
        const to = from.clone().addScaledVector(dir, distToFence + 3.6);
        to.y = 0;
        e.climb = { t: 0, dur: 1.1, from, to };
        e.group.rotation.y = Math.atan2(-dir.x, -dir.z);
        continue;
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

      // If carrying loot, flee toward spawn edge (mission complete for this thief)
      if (e.carryingLoot) {
        const fleeDir = new THREE.Vector3(0, 0, -1); // back toward spawn
        e.group.position.addScaledVector(fleeDir, e.def.speed * 0.7 * dt);
        e.group.rotation.y = Math.atan2(-fleeDir.x, -fleeDir.z);
        if (e.animator) {
          e.animator.setState('run', ['walk'], 1);
          e.animator.update(dt);
        }
        // Despawn when far enough
        if (e.group.position.z < -(this.spawnDistance + 10)) {
          e.alive = false;
          e.rewardCredited = true; // no reward for escaped thieves
          e.group.visible = false;
        }
        continue;
      }

      if (dist > 1.5) {
        dir.normalize();
        e.group.position.addScaledVector(dir, e.def.speed * dt);
        e.group.rotation.y = Math.atan2(-dir.x, -dir.z);
      } else {
        // In range — attack
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          e.attackTimer = e.def.attackCooldown;
          if (e.target && e.target.alive) {
            e.target.health -= e.def.damage;

            // Check if this attack destroyed the defense
            if (e.target.health <= 0 && e.target.type) {
              this._spawnLoot(e.target, e);
            }
          } else {
            // Attack station
            station.health -= e.def.damage;
          }
        }
      }

      // Drive animation from the state machine (moving vs attacking)
      if (e.animator) {
        if (dist > 1.5) {
          // Locomotion — playback rate scales with actual speed
          const rate = Math.max(0.5, e.def.speed / 3.5);
          if (e.type === 'CABLE_THIEF') e.animator.setState('run', ['walk'], rate * 0.7);
          else e.animator.setState('walk', ['run'], rate);
        } else if (e.target && e.target.type === 'FENCE') {
          e.animator.setState('break_fence', ['heavy_attack', 'attack', 'steal'], 1);
        } else if (e.target) {
          e.animator.setState(
            e.type === 'CABLE_THIEF' ? 'steal' : (e.type === 'VANDAL' ? 'heavy_attack' : 'attack'),
            ['attack', 'heavy_attack', 'steal'], 1
          );
        } else {
          e.animator.setState(e.type === 'VANDAL' ? 'heavy_attack' : 'attack',
            ['attack', 'heavy_attack'], 1);
        }
        e.animator.update(dt);
      }

      // One-time feet-on-ground calibration shortly after spawn
      if (e.groundTimer !== undefined && e.animator) {
        e.groundTimer -= dt;
        if (e.groundTimer <= 0) {
          this._groundFeet(e);
          e.groundTimer = undefined;
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
          // Play the death clip if one exists; otherwise disappear as before
          if (e.animator && e.animator.playOneShot('death', { holdLast: true })) {
            e.stunTimer = 0;
            e.deathTimer = 1.6;
          } else {
            e.group.visible = false;
          }
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

  // --- Loot-drop system ---

  _spawnLoot(defense, attacker) {
    const pos = defense.group.position.clone();
    const lootGroup = new THREE.Group();

    if (defense.type === 'SOLAR_PANEL') {
      // Broken panel fragments + metal beams
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.08, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x1a3d6f, metalness: 0.5, roughness: 0.6 })
      );
      panel.rotation.x = 0.3;
      panel.rotation.z = 0.15;
      panel.position.y = 0.4;
      lootGroup.add(panel);

      // Snapped support beam
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
      );
      beam.position.set(0.3, 0.6, 0);
      beam.rotation.z = 0.4;
      lootGroup.add(beam);

      // Loose cable
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4),
        new THREE.MeshStandardMaterial({ color: 0xcc4400 })
      );
      cable.position.set(-0.4, 0.2, 0.3);
      cable.rotation.x = 1.2;
      lootGroup.add(cable);
    } else if (defense.type === 'WIND_TURBINE') {
      // Twisted metal sheet from turbine
      const sheet = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.06, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 })
      );
      sheet.rotation.set(0.2, 0.5, -0.3);
      sheet.position.y = 0.5;
      lootGroup.add(sheet);

      // Bent blade fragment
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 2.0, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee })
      );
      blade.position.set(0.5, 1.0, 0);
      blade.rotation.z = 0.6;
      lootGroup.add(blade);
    } else {
      // Generic scrap for fence/turret
      const scrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.4 })
      );
      scrap.position.y = 0.3;
      lootGroup.add(scrap);
    }

    lootGroup.position.copy(pos);
    lootGroup.position.y = 0;
    this.scene.add(lootGroup);

    const loot = { group: lootGroup, type: defense.type, fadeTimer: null, carrier: null };

    // If a Cable Thief destroyed it, attach loot to the thief
    if (attacker.type === 'CABLE_THIEF') {
      this._attachLootToThief(loot, attacker);
    } else {
      // Loot just sits and fades out after a few seconds
      loot.fadeTimer = 5.0;
    }

    this.lootObjects.push(loot);
  }

  _attachLootToThief(loot, enemy) {
    // Parent loot to the enemy group (carried on back)
    this.scene.remove(loot.group);
    loot.group.position.set(0, 1.8, 0.4); // on the back/shoulder
    loot.group.scale.setScalar(0.5);       // shrink to carry size
    enemy.group.add(loot.group);
    loot.carrier = enemy;
    enemy.carryingLoot = loot;
  }

  updateLoot(dt) {
    for (let i = this.lootObjects.length - 1; i >= 0; i--) {
      const loot = this.lootObjects[i];

      // If carrier died, drop the loot on the ground (no recovery — purely visual)
      if (loot.carrier && !loot.carrier.alive) {
        const worldPos = new THREE.Vector3();
        loot.group.getWorldPosition(worldPos);
        loot.carrier.group.remove(loot.group);
        loot.group.position.copy(worldPos);
        loot.group.position.y = 0;
        loot.group.scale.setScalar(1);
        this.scene.add(loot.group);
        loot.carrier = null;
        loot.fadeTimer = 3.0; // fade out after drop
      }

      // Fade out unclaimed loot
      if (loot.fadeTimer !== null) {
        loot.fadeTimer -= dt;
        if (loot.fadeTimer <= 1.0) {
          // Fade opacity
          loot.group.traverse(child => {
            if (child.isMesh && child.material) {
              child.material.transparent = true;
              child.material.opacity = Math.max(0, loot.fadeTimer);
            }
          });
        }
        if (loot.fadeTimer <= 0) {
          this.scene.remove(loot.group);
          this.lootObjects.splice(i, 1);
        }
      }
    }
  }

  clearAll() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
    }
    this.enemies = [];
    for (const l of this.lootObjects) {
      if (l.carrier) {
        // already parented to enemy group, removed above
      } else {
        this.scene.remove(l.group);
      }
    }
    this.lootObjects = [];
  }
}

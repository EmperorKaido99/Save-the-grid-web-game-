import * as THREE from 'three';
import { DEFENSE_TYPES } from './data/defenses.js';
import { STATION } from './Scene.js';
import { Models } from './ModelLoader.js';

export class DefenseManager {
  constructor(scene) {
    this.scene = scene;
    this.defenses = [];
    this._projectiles = [];
  }

  place(typeId, cx, cz) {
    const typeDef = DEFENSE_TYPES[typeId];
    if (!typeDef) return null;

    const level = 0;
    const stats = typeDef.levels[level];
    const group = new THREE.Group();

    this._buildMesh(group, typeId, level);

    // Range indicator (shown in god mode)
    if (stats.range > 0) {
      const rangeGeo = new THREE.RingGeometry(stats.range - 0.1, stats.range, 32);
      const rangeMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
      });
      const rangeRing = new THREE.Mesh(rangeGeo, rangeMat);
      rangeRing.rotation.x = -Math.PI / 2;
      rangeRing.position.y = 0.1;
      rangeRing.visible = false;
      rangeRing.name = 'rangeRing';
      group.add(rangeRing);
    }

    // Health bar
    const hbY = typeId === 'WIND_TURBINE' ? 9 : typeId === 'FENCE' ? 3.5 : 2.5;
    const hbBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide })
    );
    hbBg.position.y = hbY;
    hbBg.name = 'hbBg';
    group.add(hbBg);

    const hbFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x33ff66, side: THREE.DoubleSide })
    );
    hbFill.position.y = hbY;
    hbFill.position.z = 0.01;
    hbFill.name = 'hbFill';
    group.add(hbFill);

    // Level indicator stars
    const levelIndicator = this._createLevelIndicator(level);
    levelIndicator.position.y = hbY + 0.3;
    levelIndicator.name = 'levelIndicator';
    group.add(levelIndicator);

    group.position.set(cx, 0, cz);
    this.scene.add(group);

    const defense = {
      id: crypto.randomUUID(),
      type: typeId,
      typeDef,
      group,
      level,
      health: stats.health,
      maxHealth: stats.health,
      attackTimer: 0,
      alive: true,
      cx, cz,
    };
    this.defenses.push(defense);
    return defense;
  }

  // Upgrade a defense to the next level
  upgrade(defense) {
    if (!defense || !defense.alive) return false;
    const nextLevel = defense.level + 1;
    if (nextLevel >= defense.typeDef.levels.length) return false;

    const newStats = defense.typeDef.levels[nextLevel];
    defense.level = nextLevel;
    defense.maxHealth = newStats.health;
    defense.health = newStats.health; // full heal on upgrade

    // Rebuild mesh visuals
    this._rebuildMesh(defense);
    // Update range ring
    this._updateRangeRing(defense, newStats);
    // Update level indicator
    this._updateLevelIndicator(defense);

    return true;
  }

  _buildMesh(group, typeId, level) {
    const stats = DEFENSE_TYPES[typeId].levels[level];

    // Try loaded GLB model first
    const modelKey = { SOLAR_PANEL: 'solarPanel', WIND_TURBINE: 'windTurbine', TURRET: 'turret', FENCE: 'fence' }[typeId];
    if (modelKey && Models.has(modelKey)) {
      const model = Models.getClone(modelKey);
      if (model) {
        // Scale to fit game grid cells (~4 units)
        const scaleMap = { solarPanel: 0.3, windTurbine: 1.5, turret: 0.015, fence: 0.8 };
        model.scale.setScalar(scaleMap[modelKey] || 1.0);
        model.name = 'defMesh';

        // For wind turbine, find and tag the blade sub-mesh for rotation
        if (typeId === 'WIND_TURBINE') {
          model.traverse(child => {
            if (child.name && child.name.toLowerCase().includes('blade')) {
              group.userData.bladePivot = child;
            }
          });
        }

        // For turret, find barrel for aiming
        if (typeId === 'TURRET') {
          model.traverse(child => {
            if (child.name && child.name === 'Turret') {
              group.userData.turretPivot = child;
            }
          });
        }

        group.add(model);

        // Level visual modifier — scale up slightly per level
        const levelBoost = 1 + level * 0.1;
        model.scale.multiplyScalar(levelBoost);

        // Electric fence glow at level 3
        if (typeId === 'FENCE' && stats.electric) {
          const glowMat = new THREE.MeshBasicMaterial({
            color: 0x44aaff, transparent: true, opacity: 0.3,
          });
          const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), glowMat);
          glow.position.y = 1.5;
          glow.name = 'defMesh';
          group.add(glow);
        }

        return; // model loaded, skip primitive
      }
    }

    // === Fallback primitives (original code) ===
    if (typeId === 'SOLAR_PANEL') {
      const baseGeo = new THREE.BoxGeometry(0.4, 0.8, 0.4);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.4;
      base.castShadow = true;
      base.name = 'defMesh';
      group.add(base);

      const panelGeo = new THREE.BoxGeometry(2.4, 0.1, 2.0);
      const brightness = 0x1a3d8f + level * 0x0a1530;
      const panelMat = new THREE.MeshStandardMaterial({
        color: brightness, metalness: 0.6, roughness: 0.3,
      });
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(0, 1.2, -0.2);
      panel.rotation.x = -0.4;
      panel.castShadow = true;
      panel.name = 'defMesh';
      group.add(panel);

      const lineGeo = new THREE.EdgesGeometry(panelGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x4488cc });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      lines.position.copy(panel.position);
      lines.rotation.copy(panel.rotation);
      lines.name = 'defMesh';
      group.add(lines);

      // Healing glow for level 2+
      if (stats.healPerSecond > 0) {
        const glowGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0x44ff88, transparent: true, opacity: 0.3,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.y = 1.5;
        glow.name = 'defMesh';
        group.add(glow);
      }
    } else if (typeId === 'WIND_TURBINE') {
      const towerGeo = new THREE.CylinderGeometry(0.2, 0.35, 7, 8);
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.y = 3.5;
      tower.castShadow = true;
      tower.name = 'defMesh';
      group.add(tower);

      const hubGeo = new THREE.BoxGeometry(0.6, 0.5, 1.0);
      const hubMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.y = 7.2;
      hub.name = 'defMesh';
      group.add(hub);

      const bladePivot = new THREE.Group();
      bladePivot.position.set(0, 7.2, -0.5);
      bladePivot.name = 'defMesh';
      const bladeLen = 3.0 + level * 0.5;
      const bladeGeo = new THREE.BoxGeometry(0.2, bladeLen, 0.05);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.y = bladeLen / 2;
        const wrapper = new THREE.Group();
        wrapper.add(blade);
        wrapper.rotation.z = (i / 3) * Math.PI * 2;
        bladePivot.add(wrapper);
      }
      group.add(bladePivot);
      group.userData.bladePivot = bladePivot;
    } else if (typeId === 'TURRET') {
      // Base platform
      const baseGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.5, 8);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x555566 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.25;
      base.castShadow = true;
      base.name = 'defMesh';
      group.add(base);

      // Turret body
      const bodyGeo = new THREE.CylinderGeometry(0.6, 0.8, 1.0 + level * 0.3, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x667788 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.0 + level * 0.15;
      body.castShadow = true;
      body.name = 'defMesh';
      group.add(body);

      // Barrel
      const barrelLen = 1.5 + level * 0.4;
      const barrelGeo = new THREE.CylinderGeometry(0.12, 0.15, barrelLen, 6);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 1.5 + level * 0.15, -barrelLen / 2 - 0.3);
      barrel.castShadow = true;
      barrel.name = 'defMesh';
      group.add(barrel);

      // Muzzle flash point
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 1.5 + level * 0.15, -barrelLen - 0.4);
      muzzle.name = 'muzzle';
      group.add(muzzle);

      // Level 2+: extra armor plates
      if (level >= 1) {
        const armorGeo = new THREE.BoxGeometry(1.6, 0.6, 0.15);
        const armorMat = new THREE.MeshStandardMaterial({ color: 0x556677 });
        for (const z of [-0.8, 0.8]) {
          const armor = new THREE.Mesh(armorGeo, armorMat);
          armor.position.set(0, 0.8, z);
          armor.name = 'defMesh';
          group.add(armor);
        }
      }
      // Level 3: dual barrel indicator (glow)
      if (level >= 2) {
        const glowGeo = new THREE.SphereGeometry(0.25, 6, 6);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xff4444, transparent: true, opacity: 0.5,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(0, 2.2, -0.5);
        glow.name = 'defMesh';
        group.add(glow);
      }
    } else if (typeId === 'FENCE') {
      const isElectric = stats.electric;

      // Fence posts
      const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 6);
      const postMat = new THREE.MeshStandardMaterial({
        color: isElectric ? 0x4488cc : 0x888888,
      });
      for (const x of [-1.5, 0, 1.5]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 1.5, 0);
        post.castShadow = true;
        post.name = 'defMesh';
        group.add(post);
      }

      // Wire/chain-link panels
      const panelCount = 2 + level;
      const wireMat = new THREE.MeshStandardMaterial({
        color: isElectric ? 0x44aaff : 0xaaaaaa,
        wireframe: !isElectric,
        transparent: true,
        opacity: isElectric ? 0.6 : 0.5,
        side: THREE.DoubleSide,
      });
      for (let i = 0; i < panelCount; i++) {
        const wireGeo = new THREE.PlaneGeometry(3.2, 0.5);
        const wire = new THREE.Mesh(wireGeo, wireMat);
        wire.position.y = 0.5 + i * 0.7;
        wire.name = 'defMesh';
        group.add(wire);
      }

      // Electric sparks for level 3
      if (isElectric) {
        const sparkGeo = new THREE.SphereGeometry(0.15, 4, 4);
        const sparkMat = new THREE.MeshBasicMaterial({
          color: 0x44ddff, transparent: true, opacity: 0.7,
        });
        for (let i = 0; i < 4; i++) {
          const spark = new THREE.Mesh(sparkGeo, sparkMat);
          spark.position.set(
            (Math.random() - 0.5) * 3,
            0.5 + Math.random() * 2,
            (Math.random() - 0.5) * 0.3
          );
          spark.name = 'defMesh';
          spark.userData.isSpark = true;
          group.add(spark);
        }
      }

      // Top razor wire for level 2+
      if (level >= 1) {
        const razorGeo = new THREE.TorusGeometry(0.15, 0.03, 4, 12);
        const razorMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        for (let x = -1.5; x <= 1.5; x += 0.6) {
          const razor = new THREE.Mesh(razorGeo, razorMat);
          razor.position.set(x, 3.1, 0);
          razor.rotation.y = Math.PI / 2;
          razor.name = 'defMesh';
          group.add(razor);
        }
      }
    }
  }

  _rebuildMesh(defense) {
    // Remove old mesh children (keep health bar, range ring, level indicator)
    const toRemove = [];
    defense.group.children.forEach(child => {
      if (child.name === 'defMesh') toRemove.push(child);
    });
    toRemove.forEach(child => {
      defense.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    // Also clear blade pivot reference
    defense.group.userData.bladePivot = null;

    // Rebuild
    this._buildMesh(defense.group, defense.type, defense.level);
  }

  _updateRangeRing(defense, stats) {
    const oldRing = defense.group.getObjectByName('rangeRing');
    if (oldRing) {
      defense.group.remove(oldRing);
      oldRing.geometry.dispose();
      oldRing.material.dispose();
    }
    if (stats.range > 0) {
      const rangeGeo = new THREE.RingGeometry(stats.range - 0.1, stats.range, 32);
      const rangeMat = new THREE.MeshBasicMaterial({
        color: stats.electric ? 0x44aaff : 0x00ff88,
        transparent: true, opacity: 0.12, side: THREE.DoubleSide,
      });
      const rangeRing = new THREE.Mesh(rangeGeo, rangeMat);
      rangeRing.rotation.x = -Math.PI / 2;
      rangeRing.position.y = 0.1;
      rangeRing.visible = false;
      rangeRing.name = 'rangeRing';
      defense.group.add(rangeRing);
    }
  }

  _createLevelIndicator(level) {
    const group = new THREE.Group();
    const starGeo = new THREE.CircleGeometry(0.1, 5);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, side: THREE.DoubleSide });
    for (let i = 0; i <= level; i++) {
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.x = (i - level / 2) * 0.25;
      group.add(star);
    }
    return group;
  }

  _updateLevelIndicator(defense) {
    const old = defense.group.getObjectByName('levelIndicator');
    if (old) {
      defense.group.remove(old);
    }
    const hbY = defense.type === 'WIND_TURBINE' ? 9 : defense.type === 'FENCE' ? 3.5 : 2.5;
    const indicator = this._createLevelIndicator(defense.level);
    indicator.position.y = hbY + 0.3;
    indicator.name = 'levelIndicator';
    defense.group.add(indicator);
  }

  update(dt, enemyManager) {
    for (const d of this.defenses) {
      if (!d.alive) continue;

      const stats = d.typeDef.levels[d.level];

      // Spin wind turbine blades
      if (d.type === 'WIND_TURBINE' && d.group.userData.bladePivot) {
        d.group.userData.bladePivot.rotation.z += (2.0 + d.level * 0.5) * dt;
      }

      // Electric fence spark animation
      if (d.type === 'FENCE' && stats.electric) {
        d.group.children.forEach(child => {
          if (child.userData && child.userData.isSpark) {
            child.visible = Math.random() > 0.3;
            child.position.x = (Math.random() - 0.5) * 3;
            child.position.y = 0.5 + Math.random() * 2;
          }
        });
      }

      // Solar panel station healing
      if (d.type === 'SOLAR_PANEL' && stats.healPerSecond > 0) {
        if (STATION.health < STATION.maxHealth) {
          STATION.health = Math.min(STATION.maxHealth, STATION.health + stats.healPerSecond * dt);
        }
      }

      // Auto-attack (turrets, solar, wind, electric fences)
      if (stats.range > 0 && stats.damage > 0) {
        d.attackTimer -= dt;
        if (d.attackTimer <= 0) {
          // Electric fences damage all enemies in range passively
          if (d.type === 'FENCE' && stats.electric) {
            const hits = enemyManager.damageInRadius(d.group.position, stats.range, stats.damage);
            if (hits.length > 0) {
              d.attackTimer = stats.attackCooldown;
            } else {
              d.attackTimer = 0.2; // check again soon
            }
          } else {
            const target = enemyManager.findNearest(d.group.position, stats.range);
            if (target) {
              d.attackTimer = stats.attackCooldown;
              this._fireProjectile(d, target, stats);
            }
          }
        }
      }

      // Fences as barriers: enemies near a fence take longer (handled in enemy AI)

      // Check if destroyed
      if (d.health <= 0) {
        d.alive = false;
        d.group.visible = false;
      }

      // Update health bar
      const hbFill = d.group.getObjectByName('hbFill');
      if (hbFill) {
        const ratio = Math.max(0, d.health / d.maxHealth);
        hbFill.scale.x = ratio;
        hbFill.position.x = -(1.48 * (1 - ratio)) / 2;
        hbFill.material.color.setHex(ratio > 0.5 ? 0x33ff66 : ratio > 0.25 ? 0xffaa00 : 0xff3333);
      }
    }

    this._updateProjectiles(dt, enemyManager);
  }

  _fireProjectile(defense, target, stats) {
    let startY;
    if (defense.type === 'WIND_TURBINE') startY = 7;
    else if (defense.type === 'TURRET') startY = 1.5 + defense.level * 0.15;
    else startY = 1.5;

    const start = defense.group.position.clone();
    start.y = startY;

    const colors = {
      SOLAR_PANEL: 0xffee44,
      WIND_TURBINE: 0x88ddff,
      TURRET: 0xff6644,
    };

    const geo = new THREE.SphereGeometry(defense.type === 'TURRET' ? 0.15 : 0.2, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[defense.type] || 0xffffff,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start);
    this.scene.add(mesh);

    this._projectiles.push({
      mesh,
      target,
      damage: stats.damage,
      speed: defense.type === 'TURRET' ? 45 : 30,
      isAOE: defense.type === 'WIND_TURBINE',
    });
  }

  _updateProjectiles(dt, enemyManager) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      if (!p.target.alive) {
        this.scene.remove(p.mesh);
        this._projectiles.splice(i, 1);
        continue;
      }

      const targetPos = p.target.group.position.clone();
      targetPos.y += 1;
      const dir = targetPos.sub(p.mesh.position);
      const dist = dir.length();

      if (dist < 0.8) {
        if (p.isAOE) {
          enemyManager.damageInRadius(p.target.group.position, 4, p.damage);
        } else {
          p.target.health -= p.damage;
          p.target.stunTimer = 0.15;
          if (p.target.health <= 0) p.target.alive = false;
        }
        this.scene.remove(p.mesh);
        this._projectiles.splice(i, 1);
      } else {
        dir.normalize();
        p.mesh.position.addScaledVector(dir, p.speed * dt);
      }
    }
  }

  // Find a defense near a world position (for clicking to upgrade)
  findAt(worldX, worldZ, threshold = 2.5) {
    let closest = null;
    let closestDist = threshold;
    for (const d of this.defenses) {
      if (!d.alive) continue;
      const dx = d.group.position.x - worldX;
      const dz = d.group.position.z - worldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < closestDist) {
        closestDist = dist;
        closest = d;
      }
    }
    return closest;
  }

  showRanges() {
    for (const d of this.defenses) {
      const ring = d.group.getObjectByName('rangeRing');
      if (d.alive && ring) ring.visible = true;
    }
  }

  hideRanges() {
    for (const d of this.defenses) {
      const ring = d.group.getObjectByName('rangeRing');
      if (ring) ring.visible = false;
    }
  }

  getTotalKWPerSecond() {
    let total = 0;
    for (const d of this.defenses) {
      if (d.alive) total += d.typeDef.levels[d.level].kwPerSecond;
    }
    return total;
  }

  get aliveDefenses() {
    return this.defenses.filter(d => d.alive);
  }

  clearAll() {
    for (const d of this.defenses) {
      this.scene.remove(d.group);
    }
    this.defenses = [];
    for (const p of this._projectiles) {
      this.scene.remove(p.mesh);
    }
    this._projectiles = [];
  }
}

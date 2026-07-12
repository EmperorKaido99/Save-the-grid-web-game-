import * as THREE from 'three';
import { createScene, STATION } from './Scene.js';
import { CameraController } from './CameraController.js';
import { InputManager } from './InputManager.js';
import { Player } from './Player.js';
import { Grid } from './Grid.js';
import { Economy } from './Economy.js';
import { EnemyManager } from './EnemyManager.js';
import { DefenseManager } from './DefenseManager.js';
import { WaveManager } from './WaveManager.js';
import { UI } from './UI.js';
import { getRandomFact } from './data/funFacts.js';
import { DEFENSE_TYPES, getUpgradeCost } from './data/defenses.js';

const State = {
  GOD_MODE: 'GOD_MODE',
  WAVE_ACTIVE: 'WAVE_ACTIVE',
  WAVE_COMPLETE: 'WAVE_COMPLETE',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY',
};

export class Game {
  constructor() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(this.renderer.domElement);

    // Core systems
    this.scene = createScene();
    this.cameras = new CameraController(this.renderer.domElement);
    this.input = new InputManager(this.renderer.domElement);
    this.player = new Player(this.scene);
    this.grid = new Grid(this.scene);
    this.economy = new Economy(80);
    this.enemies = new EnemyManager(this.scene);
    this.defenses = new DefenseManager(this.scene);
    this.waves = new WaveManager();
    this.ui = new UI();

    // State
    this.state = State.GOD_MODE;
    this.defenseCount = 0;
    this.selectedUpgradeTarget = null; // defense being viewed for upgrade

    // Ground reference for raycasting
    this.ground = this.scene.getObjectByName('ground');

    // UI callbacks
    this.ui.onStartWave = () => this._startWave();
    this.ui.onSelectDefense = () => {
      // Deselect upgrade target when selecting a new placement type
      this.selectedUpgradeTarget = null;
      this.ui.hideUpgradePanel();
    };
    this.ui.onUpgrade = () => this._upgradeSelected();

    // Stun gun zap visuals
    this._zapLines = [];
    this._tabHeld = false;

    // Selection highlight ring
    const selGeo = new THREE.RingGeometry(2.2, 2.5, 24);
    const selMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    this._selectionRing = new THREE.Mesh(selGeo, selMat);
    this._selectionRing.rotation.x = -Math.PI / 2;
    this._selectionRing.position.y = 0.15;
    this._selectionRing.visible = false;
    this.scene.add(this._selectionRing);

    this._enterGodMode();

    // Handle resize
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // --- State transitions ---

  _enterGodMode() {
    this.state = State.GOD_MODE;
    this.input.wantsLock = false;
    this.input.exitLock();
    this.ui.hideLockHint();
    this.ui.setAiming(false);
    this.cameras.setGodMode();
    this.grid.show();
    this.defenses.showRanges();
    this.player.hide();
    this.ui.showGodPanel();
    this.ui.hideStationBar();
    this.ui.hideAbilityHUD();
    this.ui.updateWave(this.waves.waveNumber, this.waves.totalWaves);
    this.selectedUpgradeTarget = null;
    this._selectionRing.visible = false;
  }

  _startWave() {
    if (!this.waves.hasMoreWaves) return;

    this.state = State.WAVE_ACTIVE;
    this.cameras.setCharacterMode();
    this.cameras.snapBehind(this.player.position, this.player.rotationY);
    this.input.wantsLock = true;
    this.input.requestLock();
    this.grid.hide();
    this.defenses.hideRanges();
    this.player.show();
    this.ui.hideGodPanel();
    this.ui.showCrosshair();
    this.ui.showStationBar();
    this.ui.showAbilityHUD(this.player.activeChar);
    this.selectedUpgradeTarget = null;
    this._selectionRing.visible = false;

    const wave = this.waves.currentWave;
    this.ui.showAnnouncement(`Wave ${wave.id}: ${wave.name}`, wave.announcement);
    this.waves.startWave();
  }

  _waveComplete() {
    this.state = State.WAVE_COMPLETE;
    this.enemies.clearAll();

    const bonus = 30 + this.waves.waveNumber * 10;
    this.economy.earn(bonus);
    this.ui.showAnnouncement('Wave Clear!', `+${bonus} KW bonus`);

    if (this.waves.isLastWave) {
      setTimeout(() => this._victory(), 2500);
    } else {
      this.waves.advanceWave();
      setTimeout(() => this._enterGodMode(), 2500);
    }
  }

  _gameOver() {
    this.state = State.GAME_OVER;
    this.input.wantsLock = false;
    this.input.exitLock();
    this.ui.hideLockHint();
    this.ui.hideStationBar();
    this.ui.hideAbilityHUD();
    this.ui.showEndScreen(false, {
      waves: this.waves.waveNumber - 1,
      earned: this.economy.totalEarned,
      defenses: this.defenseCount,
    });
  }

  _victory() {
    this.state = State.VICTORY;
    this.input.wantsLock = false;
    this.input.exitLock();
    this.ui.hideLockHint();
    this.ui.hideStationBar();
    this.ui.hideAbilityHUD();
    this.ui.showEndScreen(true, {
      waves: this.waves.totalWaves,
      earned: this.economy.totalEarned,
      defenses: this.defenseCount,
    });
  }

  _upgradeSelected() {
    const d = this.selectedUpgradeTarget;
    if (!d || !d.alive) return;

    const cost = getUpgradeCost(d.type, d.level);
    if (cost === null) return; // already max
    if (!this.economy.canAfford(cost)) return;

    this.economy.spend(cost);
    this.defenses.upgrade(d);

    // Refresh the upgrade panel with new stats
    this.ui.showUpgradePanel(d);
  }

  // --- Main update loop ---

  update(dt) {
    dt = Math.min(dt, 0.1);

    // Passive KW income from defenses
    const kwRate = this.defenses.getTotalKWPerSecond();
    this.economy.addPassiveIncome(kwRate, dt);

    // Update HUD
    this.ui.updateKW(this.economy.balance);
    this.ui.updateKWRate(kwRate);
    this.ui.updateStationHP(STATION.health, STATION.maxHealth);

    if (this.state === State.GOD_MODE) {
      this._updateGodMode(dt);
    } else if (this.state === State.WAVE_ACTIVE) {
      this._updateWaveActive(dt);
    }

    // Update zap visuals
    this._updateZaps(dt);

    // Pulse the selection ring
    if (this._selectionRing.visible) {
      this._selectionRing.material.opacity = 0.3 + 0.2 * Math.sin(performance.now() * 0.005);
    }

    // Render
    this.renderer.render(this.scene, this.cameras.active);
    this.input.endFrame();
  }

  _updateGodMode(dt) {
    this.ui.updateDefenseButtons(this.economy.balance);
    if (this.selectedUpgradeTarget) {
      this.ui.updateUpgradeAffordability(this.economy.balance, this.selectedUpgradeTarget);
    }

    // Defenses still auto-attack (nothing to attack, but keeps things updated)
    this.defenses.update(dt, this.enemies);

    // Raycast cursor onto ground
    if (!this.ground) return;
    const hit = this.cameras.raycastGround(
      this.input.mouse.ndcX, this.input.mouse.ndcY, this.ground
    );
    if (!hit) return;

    const { cx, cz } = this.grid.worldToCell(hit.x, hit.z);

    // If no defense type selected, always show grid highlight for feedback
    if (this.ui.selectedDefense) {
      this.grid.updateHighlight(cx, cz);
    } else {
      this.grid.highlight.visible = false;
    }

    // Click handling
    if (this.input.mouse.clicked) {
      // First: check if clicking on an existing defense for upgrade
      const existing = this.defenses.findAt(hit.x, hit.z);
      if (existing) {
        this.selectedUpgradeTarget = existing;
        this._selectionRing.visible = true;
        this._selectionRing.position.set(existing.cx, 0.15, existing.cz);
        this.ui.showUpgradePanel(existing);
        // Deselect placement
        this.ui.selectedDefense = null;
        document.querySelectorAll('.defense-btn').forEach(b => b.classList.remove('selected'));
        return;
      }

      // Second: place a new defense if type is selected
      if (this.ui.selectedDefense) {
        this._tryPlaceDefense(this.ui.selectedDefense, cx, cz);
      } else {
        // Clicked empty space with nothing selected — dismiss upgrade panel
        this.selectedUpgradeTarget = null;
        this._selectionRing.visible = false;
        this.ui.hideUpgradePanel();
      }
    }
  }

  _tryPlaceDefense(typeId, cx, cz) {
    const typeDef = DEFENSE_TYPES[typeId];
    if (!typeDef) return;
    const cost = typeDef.levels[0].cost;
    if (!this.grid.canPlace(cx, cz)) return;
    if (!this.economy.canAfford(cost)) return;

    this.economy.spend(cost);
    this.grid.occupy(cx, cz, typeId);
    this.defenses.place(typeId, cx, cz);
    this.defenseCount++;

    // Show fun fact (only for energy types)
    if (typeId === 'SOLAR_PANEL' || typeId === 'WIND_TURBINE') {
      const fact = getRandomFact(typeId);
      this.ui.showFact(fact);
    }
  }

  _updateWaveActive(dt) {
    // Spawn enemies
    const toSpawn = this.waves.update(dt);
    for (const typeId of toSpawn) {
      this.enemies.spawn(typeId);
    }

    // Switch character with Tab (Q also works)
    const switchPressed = this.input.keys['Tab'] || this.input.keys['KeyQ'];
    if (switchPressed && !this._tabHeld) {
      this._tabHeld = true;
      const newChar = this.player.switchCharacter();
      this.ui.updateActiveCharacter(newChar);
      this.ui.showAbilityHUD(newChar);
      // Characters swap positions — snap the camera behind the new one
      this.cameras.snapBehind(this.player.position, this.cameras.yaw);
    }
    if (!switchPressed) this._tabHeld = false;

    // Actions are live when the mouse is captured, or in fallback mode where
    // pointer lock is unavailable and plain mouse movement steers the camera.
    // While a capture is still possible, prompt for the click that grabs it.
    const pointerActive = this.input.isLocked || this.input.lockFailed;
    if (pointerActive) {
      this.ui.hideLockHint();
    } else {
      this.ui.showLockHint();
    }

    // Aim mode (GTA-style over-the-shoulder): Combat Worker + right mouse held
    const aiming = pointerActive &&
      this.player.activeChar === 'COMBAT' && this.input.mouse.rightDown;

    // Mouse look — orbit the camera around the player; wheel zooms
    this.cameras.addLook(this.input.look.dx, this.input.look.dy, aiming);
    if (this.input.wheelDelta !== 0) {
      this.cameras.addZoom(this.input.wheelDelta);
    }

    // Edge-glide: without pointer lock the cursor stops at the screen border,
    // so keep turning while it's pushed against an edge (like an RTS camera)
    if (!this.input.isLocked) {
      const margin = 40;
      const mx = this.input.mouse.x, my = this.input.mouse.y;
      let gx = 0, gy = 0;
      if (mx <= margin) gx = -1; else if (mx >= window.innerWidth - margin) gx = 1;
      if (my <= margin) gy = -1; else if (my >= window.innerHeight - margin) gy = 1;
      if (gx || gy) this.cameras.addLook(gx * 900 * dt, gy * 600 * dt, aiming);
    }

    // Update player movement (WASD relative to camera, sprint, jump, aim strafe)
    this.player.update(this.input, dt, this.cameras.forwardYaw, aiming);

    // Spring-arm camera follows behind the player
    this.cameras.followPlayer(this.player.position, dt, {
      aiming,
      sprinting: this.player.sprinting && this.player.moving,
    });

    // Crosshair feedback for aim mode
    this.ui.setAiming(aiming);

    // Update HUD bars
    this.ui.updateStationBar(STATION.health, STATION.maxHealth);
    if (this.player.activeChar === 'COMBAT') {
      this.ui.updateCooldown(this.player.cooldownTimer, this.player.stats.abilityCooldown);
    } else {
      this.ui.updateRepairRing(this.player.isRepairing);
    }

    // Player abilities — depends on active character
    const stats = this.player.stats;
    if (this.player.activeChar === 'COMBAT') {
      // Combat Worker: stun gun fires where the camera (crosshair) points
      if (pointerActive && this.input.mouse.clicked) {
        if (this.player.tryFire()) {
          this.player.rotationY = this.cameras.forwardYaw;
          const stunPoint = this.player.getStunTarget();
          this.enemies.damageInRadius(
            stunPoint, stats.abilityRange * 0.6, stats.abilityDamage
          );
          this._createZap(this.player.position, stunPoint);
        }
      }
    } else {
      // Repair Worker: hold click to repair nearby defense/station (no combat)
      this.player.isRepairing = pointerActive && this.input.mouse.down;
      if (this.player.isRepairing) {
        const repaired = this.player.tryRepair(
          this.defenses.aliveDefenses, STATION, dt
        );
        if (repaired) {
          this.ui.showRepairEffect();
        }
      }
    }

    // Update enemies
    this.enemies.update(dt, this.defenses.aliveDefenses, STATION);

    // Update loot objects (fade, drop from dead carriers)
    this.enemies.updateLoot(dt);

    // Update defenses (auto-attack + station healing)
    this.defenses.update(dt, this.enemies);

    // Credit KW for ALL kills (stun gun, turrets, solar, wind, electric fences)
    const kills = this.enemies.collectUnrewardedKills();
    for (const e of kills) {
      this.economy.earn(e.def.reward);
      e.group.visible = false;
    }

    // Check station death
    if (STATION.health <= 0) {
      STATION.health = 0;
      this._gameOver();
      return;
    }

    // Check wave complete
    if (!this.waves.spawning && this.enemies.aliveCount === 0 && this.waves.totalSpawned > 0) {
      this._waveComplete();
    }
  }

  _createZap(from, to) {
    const points = [from.clone(), to.clone()];
    points[0].y = 1.5;
    points[1].y = 1;
    const mid = from.clone().lerp(to, 0.5);
    mid.x += (Math.random() - 0.5) * 2;
    mid.y = 1.2 + Math.random();
    mid.z += (Math.random() - 0.5) * 2;
    const curve = new THREE.QuadraticBezierCurve3(points[0], mid, points[1]);
    const curvePoints = curve.getPoints(8);
    const geo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const mat = new THREE.LineBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this._zapLines.push({ line, life: 0.15 });
  }

  _updateZaps(dt) {
    for (let i = this._zapLines.length - 1; i >= 0; i--) {
      const z = this._zapLines[i];
      z.life -= dt;
      z.line.material.opacity = Math.max(0, z.life / 0.15);
      if (z.life <= 0) {
        this.scene.remove(z.line);
        z.line.geometry.dispose();
        z.line.material.dispose();
        this._zapLines.splice(i, 1);
      }
    }
  }
}

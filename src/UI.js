import { DEFENSE_TYPES, getUpgradeCost, MAX_LEVEL } from './data/defenses.js';

// DOM-based UI overlay — HUD, placement menu, upgrade panel, popups
export class UI {
  constructor() {
    this._build();
    this.selectedDefense = null;
    this.onStartWave = null;
    this.onSelectDefense = null;
    this.onUpgrade = null;
  }

  _build() {
    // --- HUD (always visible) ---
    this.hud = this._div('hud');
    this.hud.innerHTML = `
      <div class="hud-row">
        <div class="hud-item" id="kw-display">⚡ 80 KW</div>
        <div class="hud-item" id="kw-rate">+0 KW/s</div>
        <div class="hud-item" id="wave-display">Wave 1 / 5</div>
        <div class="hud-item" id="station-hp">Station: 500 / 500</div>
        <div class="hud-item" id="load-stage">Stage 0</div>
        <div class="hud-item" id="active-char" style="display:none">Combat Worker</div>
      </div>
    `;
    document.body.appendChild(this.hud);

    // --- God Mode Panel ---
    this.godPanel = this._div('god-panel');
    this.godPanel.innerHTML = `
      <h2>PLANNING PHASE</h2>
      <p class="hint">Place & upgrade defenses to protect the grid</p>
      <div class="section-label">ENERGY</div>
      <div id="energy-buttons"></div>
      <div class="section-label">COMBAT</div>
      <div id="combat-buttons"></div>
      <div class="section-label">BARRIERS</div>
      <div id="barrier-buttons"></div>
      <button id="start-wave-btn" class="big-btn">START WAVE &#9654;</button>
      <p class="hint" style="margin-top:8px;font-size:11px;">Click placed defenses to upgrade them</p>
    `;
    document.body.appendChild(this.godPanel);

    // Defense selection buttons by category
    const containers = {
      energy: this.godPanel.querySelector('#energy-buttons'),
      combat: this.godPanel.querySelector('#combat-buttons'),
      barrier: this.godPanel.querySelector('#barrier-buttons'),
    };

    for (const [key, def] of Object.entries(DEFENSE_TYPES)) {
      const btn = document.createElement('button');
      btn.className = 'defense-btn';
      btn.dataset.type = key;
      const baseCost = def.levels[0].cost;
      btn.innerHTML = `
        <strong>${def.name}</strong>
        <span class="cost">${baseCost} KW</span>
        <small>${def.description}</small>
      `;
      btn.addEventListener('click', () => this._selectDefense(key, btn));
      const cat = containers[def.category] || containers.combat;
      cat.appendChild(btn);
    }

    this.godPanel.querySelector('#start-wave-btn').addEventListener('click', () => {
      if (this.onStartWave) this.onStartWave();
    });

    // --- Upgrade Panel (shown when clicking a placed defense in god mode) ---
    this.upgradePanel = this._div('upgrade-panel');
    this.upgradePanel.style.display = 'none';
    this.upgradePanel.innerHTML = `
      <div class="upgrade-content">
        <h3 id="upgrade-name">Solar Panel</h3>
        <div id="upgrade-level" class="upgrade-level">Level 1 / 3</div>
        <div id="upgrade-stats" class="upgrade-stats"></div>
        <button id="upgrade-btn" class="upgrade-btn">UPGRADE</button>
        <button id="upgrade-close" class="small-btn">Close</button>
      </div>
    `;
    document.body.appendChild(this.upgradePanel);

    this.upgradePanel.querySelector('#upgrade-btn').addEventListener('click', () => {
      if (this.onUpgrade) this.onUpgrade();
    });
    this.upgradePanel.querySelector('#upgrade-close').addEventListener('click', () => {
      this.hideUpgradePanel();
    });

    // --- Fun Fact Popup ---
    this.factPopup = this._div('fact-popup');
    this.factPopup.innerHTML = `
      <div class="fact-content">
        <p id="fact-text"></p>
        <button id="fact-dismiss" class="small-btn">Got it!</button>
      </div>
    `;
    this.factPopup.style.display = 'none';
    document.body.appendChild(this.factPopup);
    this.factPopup.querySelector('#fact-dismiss').addEventListener('click', () => {
      this.factPopup.style.display = 'none';
    });

    // --- Wave Announcement ---
    this.announcement = this._div('wave-announce');
    this.announcement.style.display = 'none';
    document.body.appendChild(this.announcement);

    // --- Character Mode Crosshair ---
    this.crosshair = this._div('crosshair');
    this.crosshair.textContent = '+';
    this.crosshair.style.display = 'none';
    document.body.appendChild(this.crosshair);

    // --- Pointer-lock hint (shown when mouse isn't captured in action mode) ---
    this.lockHint = this._div('lock-hint');
    this.lockHint.textContent = '🖱 Click to control the camera';
    this.lockHint.style.display = 'none';
    document.body.appendChild(this.lockHint);

    // --- Game Over / Victory Screen ---
    this.endScreen = this._div('end-screen');
    this.endScreen.style.display = 'none';
    document.body.appendChild(this.endScreen);

    // --- Repair effect indicator ---
    this.repairIndicator = this._div('repair-indicator');
    this.repairIndicator.textContent = 'REPAIRING...';
    this.repairIndicator.style.display = 'none';
    document.body.appendChild(this.repairIndicator);

    // --- Station Health Bar (bottom center — prominent, labeled) ---
    this.stationBar = this._div('station-bar');
    this.stationBar.innerHTML = `
      <div class="station-bar-label">POWER STATION</div>
      <div class="station-bar-track">
        <div class="station-bar-fill" id="station-bar-fill"></div>
      </div>
      <div class="station-bar-text" id="station-bar-text">500 / 500</div>
    `;
    this.stationBar.style.display = 'none';
    document.body.appendChild(this.stationBar);

    // --- Stun Gun Cooldown Bar (Combat Worker — bottom right) ---
    this.cooldownBar = this._div('cooldown-bar');
    this.cooldownBar.innerHTML = `
      <div class="cooldown-icon">&#9889;</div>
      <div class="cooldown-track">
        <div class="cooldown-fill" id="cooldown-fill"></div>
      </div>
      <div class="cooldown-label">STUN GUN</div>
    `;
    this.cooldownBar.style.display = 'none';
    document.body.appendChild(this.cooldownBar);

    // --- Repair Progress Ring (Repair Worker — bottom right) ---
    this.repairRing = this._div('repair-ring');
    this.repairRing.innerHTML = `
      <svg viewBox="0 0 48 48" class="repair-svg">
        <circle cx="24" cy="24" r="20" class="repair-ring-bg"/>
        <circle cx="24" cy="24" r="20" class="repair-ring-fill" id="repair-ring-fill"/>
      </svg>
      <div class="repair-ring-icon">&#128295;</div>
      <div class="repair-ring-label">REPAIR</div>
    `;
    this.repairRing.style.display = 'none';
    document.body.appendChild(this.repairRing);

    // --- Controls Help ---
    this.controlsHelp = this._div('controls-help');
    this.controlsHelp.innerHTML = `
      <div><strong>God Mode:</strong> Select defense type | Click grid to place | Click existing defense to upgrade</div>
      <div><strong>Action Mode:</strong> WASD move | Mouse look | Shift sprint | Space jump | Tab/Q switch character | Wheel zoom</div>
      <div><strong>Combat Worker:</strong> Right-click aim, click to shoot | <strong>Repair Worker:</strong> Hold click near solar panel / wind turbine to repair</div>
    `;
    document.body.appendChild(this.controlsHelp);
  }

  _div(className) {
    const el = document.createElement('div');
    el.className = className;
    return el;
  }

  _selectDefense(typeId, btn) {
    document.querySelectorAll('.defense-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    this.selectedDefense = typeId;
    this.hideUpgradePanel();
    if (this.onSelectDefense) this.onSelectDefense(typeId);
  }

  // --- Update methods ---

  updateKW(amount) {
    document.getElementById('kw-display').textContent = `⚡ ${Math.floor(amount)} KW`;
  }

  updateKWRate(rate) {
    document.getElementById('kw-rate').textContent = `+${rate.toFixed(1)} KW/s`;
  }

  updateWave(current, total) {
    document.getElementById('wave-display').textContent = `Wave ${current} / ${total}`;
  }

  updateStationHP(current, max) {
    document.getElementById('station-hp').textContent = `Station: ${Math.ceil(current)} / ${max}`;
    const ratio = current / max;
    let stage;
    if (ratio > 0.8) stage = 0;
    else if (ratio > 0.6) stage = 1;
    else if (ratio > 0.4) stage = 2;
    else if (ratio > 0.2) stage = 4;
    else stage = 6;

    const stageEl = document.getElementById('load-stage');
    stageEl.textContent = `Stage ${stage}`;
    stageEl.className = `hud-item stage-${stage > 0 ? 'active' : 'safe'}`;
  }

  updateDefenseButtons(kw) {
    document.querySelectorAll('.defense-btn').forEach(btn => {
      const def = DEFENSE_TYPES[btn.dataset.type];
      btn.classList.toggle('unaffordable', kw < def.levels[0].cost);
    });
  }

  showGodPanel() {
    this.godPanel.style.display = 'block';
    this.crosshair.style.display = 'none';
  }

  hideGodPanel() {
    this.godPanel.style.display = 'none';
    this.hideUpgradePanel();
  }

  showCrosshair() {
    this.crosshair.style.display = 'block';
    document.getElementById('active-char').style.display = 'block';
  }

  updateActiveCharacter(charId) {
    const names = { COMBAT: 'Combat Worker', REPAIR: 'Repair Worker' };
    const colors = { COMBAT: '#4488ff', REPAIR: '#ff8844' };
    const el = document.getElementById('active-char');
    el.textContent = names[charId] || charId;
    el.style.color = colors[charId] || '#fff';
    el.style.borderColor = colors[charId] || '#fff';

    // Update crosshair color
    this.crosshair.style.color = charId === 'REPAIR'
      ? 'rgba(68, 255, 136, 0.7)' : 'rgba(68, 221, 255, 0.7)';
  }

  hideFact() {
    this.factPopup.style.display = 'none';
  }

  setAiming(aiming) {
    if (this._aiming === aiming) return;
    this._aiming = aiming;
    this.crosshair.classList.toggle('aiming', aiming);
  }

  showLockHint() {
    this.lockHint.style.display = 'block';
  }

  hideLockHint() {
    this.lockHint.style.display = 'none';
  }

  showRepairEffect() {
    this.repairIndicator.style.display = 'block';
    clearTimeout(this._repairTimeout);
    this._repairTimeout = setTimeout(() => {
      this.repairIndicator.style.display = 'none';
    }, 200);
  }

  // --- Upgrade Panel ---

  showUpgradePanel(defense) {
    const typeDef = defense.typeDef;
    const level = defense.level;
    const stats = typeDef.levels[level];
    const isMaxLevel = level >= typeDef.levels.length - 1;
    const upgradeCost = getUpgradeCost(defense.type, level);

    document.getElementById('upgrade-name').textContent = typeDef.name;
    document.getElementById('upgrade-level').textContent =
      `Level ${level + 1} / ${MAX_LEVEL}`;

    let statsHtml = `
      <div class="stat-row"><span>Health:</span> <span>${stats.health}</span></div>
    `;
    if (stats.damage > 0)
      statsHtml += `<div class="stat-row"><span>Damage:</span> <span>${stats.damage}</span></div>`;
    if (stats.range > 0)
      statsHtml += `<div class="stat-row"><span>Range:</span> <span>${stats.range}</span></div>`;
    if (stats.kwPerSecond > 0)
      statsHtml += `<div class="stat-row"><span>KW/s:</span> <span>${stats.kwPerSecond}</span></div>`;
    if (stats.healPerSecond > 0)
      statsHtml += `<div class="stat-row heal"><span>Station Heal/s:</span> <span>+${stats.healPerSecond}</span></div>`;
    if (stats.electric)
      statsHtml += `<div class="stat-row electric"><span>ELECTRIFIED</span> <span>⚡</span></div>`;

    if (!isMaxLevel) {
      const nextStats = typeDef.levels[level + 1];
      statsHtml += `<div class="upgrade-preview">`;
      statsHtml += `<div class="preview-label">Next Level:</div>`;
      if (nextStats.damage > stats.damage)
        statsHtml += `<div class="stat-row preview"><span>Damage:</span> <span>${stats.damage} → ${nextStats.damage}</span></div>`;
      if (nextStats.health > stats.health)
        statsHtml += `<div class="stat-row preview"><span>Health:</span> <span>${stats.health} → ${nextStats.health}</span></div>`;
      if (nextStats.range > stats.range)
        statsHtml += `<div class="stat-row preview"><span>Range:</span> <span>${stats.range} → ${nextStats.range}</span></div>`;
      if (nextStats.kwPerSecond > stats.kwPerSecond)
        statsHtml += `<div class="stat-row preview"><span>KW/s:</span> <span>${stats.kwPerSecond} → ${nextStats.kwPerSecond}</span></div>`;
      if (nextStats.healPerSecond > 0 && nextStats.healPerSecond > (stats.healPerSecond || 0))
        statsHtml += `<div class="stat-row preview heal"><span>Heal/s:</span> <span>+${nextStats.healPerSecond}</span></div>`;
      if (nextStats.electric && !stats.electric)
        statsHtml += `<div class="stat-row preview electric"><span>UNLOCKS ELECTRIC</span> <span>⚡</span></div>`;
      statsHtml += `</div>`;
    }

    document.getElementById('upgrade-stats').innerHTML = statsHtml;

    const upgradeBtn = document.getElementById('upgrade-btn');
    if (isMaxLevel) {
      upgradeBtn.textContent = 'MAX LEVEL';
      upgradeBtn.disabled = true;
      upgradeBtn.classList.add('maxed');
    } else {
      upgradeBtn.textContent = `UPGRADE — ${upgradeCost} KW`;
      upgradeBtn.disabled = false;
      upgradeBtn.classList.remove('maxed');
    }

    this.upgradePanel.style.display = 'flex';
  }

  hideUpgradePanel() {
    this.upgradePanel.style.display = 'none';
  }

  updateUpgradeAffordability(kw, defense) {
    if (!defense) return;
    const cost = getUpgradeCost(defense.type, defense.level);
    const btn = document.getElementById('upgrade-btn');
    if (cost !== null) {
      btn.classList.toggle('unaffordable', kw < cost);
    }
  }

  showFact(text) {
    document.getElementById('fact-text').textContent = text;
    this.factPopup.style.display = 'flex';
  }

  // --- Station Health Bar (bottom center) ---

  showStationBar() {
    this.stationBar.style.display = 'block';
  }

  hideStationBar() {
    this.stationBar.style.display = 'none';
  }

  updateStationBar(current, max) {
    const ratio = Math.max(0, current / max);
    const fill = document.getElementById('station-bar-fill');
    fill.style.width = `${ratio * 100}%`;

    // Color shifts: green → yellow → red
    if (ratio > 0.6) fill.style.background = 'linear-gradient(90deg, #22aa55, #44ff88)';
    else if (ratio > 0.3) fill.style.background = 'linear-gradient(90deg, #aa8822, #ffcc44)';
    else fill.style.background = 'linear-gradient(90deg, #aa2222, #ff4444)';

    document.getElementById('station-bar-text').textContent =
      `${Math.ceil(current)} / ${max}`;
  }

  // --- Stun Gun Cooldown Bar (Combat Worker) ---

  showCooldownBar() {
    this.cooldownBar.style.display = 'flex';
  }

  hideCooldownBar() {
    this.cooldownBar.style.display = 'none';
  }

  updateCooldown(timer, maxCooldown) {
    const ratio = Math.max(0, 1 - timer / maxCooldown);
    const fill = document.getElementById('cooldown-fill');
    fill.style.width = `${ratio * 100}%`;
    fill.style.background = ratio >= 1
      ? 'linear-gradient(90deg, #44ddff, #88eeff)'
      : 'linear-gradient(90deg, #225577, #336688)';
  }

  // --- Repair Progress Ring (Repair Worker) ---

  showRepairRing() {
    this.repairRing.style.display = 'flex';
  }

  hideRepairRing() {
    this.repairRing.style.display = 'none';
  }

  updateRepairRing(active) {
    const fill = document.getElementById('repair-ring-fill');
    // circumference = 2 * PI * r = 2 * PI * 20 ≈ 125.66
    const circ = 125.66;
    if (active) {
      // Animate the ring fill — pulse when actively repairing
      const t = (performance.now() % 1000) / 1000;
      fill.style.strokeDashoffset = circ * (1 - t);
      fill.style.stroke = '#44ff88';
    } else {
      fill.style.strokeDashoffset = circ;
      fill.style.stroke = '#225533';
    }
  }

  // --- Character-specific ability HUD ---

  showAbilityHUD(charId) {
    if (charId === 'COMBAT') {
      this.showCooldownBar();
      this.hideRepairRing();
    } else {
      this.hideCooldownBar();
      this.showRepairRing();
    }
  }

  hideAbilityHUD() {
    this.hideCooldownBar();
    this.hideRepairRing();
  }

  showAnnouncement(title, subtitle) {
    this.announcement.innerHTML = `<h1>${title}</h1><p>${subtitle}</p>`;
    this.announcement.style.display = 'flex';
    setTimeout(() => {
      this.announcement.style.display = 'none';
    }, 3000);
  }

  showEndScreen(victory, stats) {
    this.endScreen.innerHTML = `
      <div class="end-content">
        <h1>${victory ? 'GRID SAVED!' : 'BLACKOUT!'}</h1>
        <p>${victory
          ? 'You kept the lights on! South Africa thanks you.'
          : 'The station went dark. Load shedding stage 8...'}</p>
        <div class="stats">
          <p>Waves survived: ${stats.waves}</p>
          <p>KW earned: ${Math.floor(stats.earned)}</p>
          <p>Defenses placed: ${stats.defenses}</p>
        </div>
        <button class="big-btn" onclick="location.reload()">PLAY AGAIN</button>
      </div>
    `;
    this.endScreen.style.display = 'flex';
  }

  hideEndScreen() {
    this.endScreen.style.display = 'none';
  }
}

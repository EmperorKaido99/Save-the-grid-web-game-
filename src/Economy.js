// KW currency system — the game's economy engine
export class Economy {
  constructor(startingKW = 80) {
    this.kw = startingKW;
    this.totalEarned = startingKW;
    this.totalSpent = 0;
  }

  get balance() {
    return Math.floor(this.kw);
  }

  canAfford(cost) {
    return this.kw >= cost;
  }

  spend(amount) {
    if (!this.canAfford(amount)) return false;
    this.kw -= amount;
    this.totalSpent += amount;
    return true;
  }

  earn(amount) {
    this.kw += amount;
    this.totalEarned += amount;
  }

  // Called each frame — defenses passively generate KW
  addPassiveIncome(kwPerSecond, dt) {
    this.earn(kwPerSecond * dt);
  }
}

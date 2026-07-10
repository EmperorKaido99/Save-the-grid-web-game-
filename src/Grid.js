import * as THREE from 'three';

// Placement grid — defines where defenses can be placed
const CELL_SIZE = 4;
const GRID_EXTENT = 11; // cells from center in each direction (so 23x23 grid)

export class Grid {
  constructor(scene) {
    this.cellSize = CELL_SIZE;
    this.cells = new Map();       // "x,z" -> { occupied, defenseId }
    this.gridGroup = new THREE.Group();
    this.gridGroup.name = 'placementGrid';
    this.gridGroup.visible = false;
    scene.add(this.gridGroup);
    this._buildVisual();

    // Highlight cell under cursor
    const hlGeo = new THREE.PlaneGeometry(CELL_SIZE - 0.2, CELL_SIZE - 0.2);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    this.highlight = new THREE.Mesh(hlGeo, hlMat);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.06;
    this.highlight.visible = false;
    this.gridGroup.add(this.highlight);
  }

  _buildVisual() {
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.2 });
    const halfSize = GRID_EXTENT * CELL_SIZE;
    const points = [];

    for (let i = -GRID_EXTENT; i <= GRID_EXTENT; i++) {
      const pos = i * CELL_SIZE;
      // Horizontal lines
      points.push(new THREE.Vector3(-halfSize, 0.05, pos));
      points.push(new THREE.Vector3(halfSize, 0.05, pos));
      // Vertical lines
      points.push(new THREE.Vector3(pos, 0.05, -halfSize));
      points.push(new THREE.Vector3(pos, 0.05, halfSize));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    this.gridGroup.add(new THREE.LineSegments(geo, mat));
  }

  show() { this.gridGroup.visible = true; }
  hide() { this.gridGroup.visible = false; this.highlight.visible = false; }

  // Convert world position to grid cell key
  worldToCell(x, z) {
    const cx = Math.round(x / CELL_SIZE) * CELL_SIZE;
    const cz = Math.round(z / CELL_SIZE) * CELL_SIZE;
    return { cx, cz, key: `${cx},${cz}` };
  }

  isOccupied(key) {
    return this.cells.has(key);
  }

  // Check if cell is within the station footprint (can't build there)
  isStationZone(cx, cz) {
    return Math.abs(cx) <= 10 && Math.abs(cz) <= 6;
  }

  canPlace(cx, cz) {
    const key = `${cx},${cz}`;
    const halfSize = GRID_EXTENT * CELL_SIZE;
    if (Math.abs(cx) > halfSize || Math.abs(cz) > halfSize) return false;
    if (this.isStationZone(cx, cz)) return false;
    return !this.isOccupied(key);
  }

  occupy(cx, cz, defenseId) {
    this.cells.set(`${cx},${cz}`, { defenseId });
  }

  free(cx, cz) {
    this.cells.delete(`${cx},${cz}`);
  }

  updateHighlight(cx, cz) {
    const canPlace = this.canPlace(cx, cz);
    this.highlight.position.set(cx, 0.06, cz);
    this.highlight.material.color.setHex(canPlace ? 0x00ff88 : 0xff4444);
    this.highlight.visible = true;
  }
}

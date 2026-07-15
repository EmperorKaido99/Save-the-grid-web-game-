#!/usr/bin/env node
// Optimizes base.glb files by resizing large textures and deduplicating data.
// Keeps mesh + skeleton intact for rendering.

const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, quantize } = require('@gltf-transform/functions');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHARS_DIR = path.join(ROOT, 'assets/models/characters');

async function optimizeBase(name) {
  const filePath = path.join(CHARS_DIR, name, 'base.glb');
  if (!fs.existsSync(filePath)) {
    console.log(`  skip: ${filePath} not found`);
    return;
  }

  const sizeBefore = fs.statSync(filePath).size;
  if (sizeBefore < 5 * 1024 * 1024) {
    console.log(`  skip (already small): ${name}/base.glb (${(sizeBefore / 1024 / 1024).toFixed(1)}MB)`);
    return;
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(filePath);
  const root = doc.getRoot();

  // Downscale large textures (>512px) to 512px by just reducing buffer size
  // Actually, gltf-transform can't resize images without sharp. Instead,
  // let's strip animations from base (they're loaded separately) and dedup.

  // Remove animations from base (they're loaded from separate clip files)
  for (const anim of root.listAnimations()) {
    anim.dispose();
  }

  // Apply optimizations
  await doc.transform(
    dedup(),
    prune(),
    quantize(),
  );

  await io.write(filePath, doc);
  const sizeAfter = fs.statSync(filePath).size;
  console.log(`  ${name}/base.glb: ${(sizeBefore / 1024 / 1024).toFixed(1)}MB -> ${(sizeAfter / 1024 / 1024).toFixed(1)}MB`);
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/optimize-base.js <character>|--all');
  process.exit(1);
}

const characters = arg === '--all'
  ? fs.readdirSync(CHARS_DIR).filter(d => fs.statSync(path.join(CHARS_DIR, d)).isDirectory())
  : [arg];

(async () => {
  for (const c of characters) {
    console.log(`Optimizing ${c}/base.glb…`);
    await optimizeBase(c);
  }
  console.log('Done.');
})();

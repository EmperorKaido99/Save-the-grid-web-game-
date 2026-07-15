#!/usr/bin/env node
// Strips mesh, material, and texture data from animation-only GLBs,
// keeping only the skeleton (bone hierarchy) and animation tracks.
// This shrinks Mixamo-exported clips from ~50MB to <1MB.
//
// Usage:
//   node scripts/strip-anim-meshes.js <character>
//   node scripts/strip-anim-meshes.js --all
//
// Skips the "base.glb" file (which needs the mesh for rendering).

const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHARS_DIR = path.join(ROOT, 'assets/models/characters');

async function stripCharacter(name) {
  const charDir = path.join(CHARS_DIR, name);
  if (!fs.existsSync(charDir)) {
    console.error(`  Directory not found: ${charDir}`);
    return;
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const glbs = fs.readdirSync(charDir).filter(f => f.endsWith('.glb') && f !== 'base.glb');

  for (const file of glbs) {
    const filePath = path.join(charDir, file);
    const sizeBefore = fs.statSync(filePath).size;

    // Skip files already small (under 2MB — already stripped or naturally small)
    if (sizeBefore < 2 * 1024 * 1024) {
      console.log(`  skip (already small): ${file} (${(sizeBefore / 1024).toFixed(0)}KB)`);
      continue;
    }

    const doc = await io.read(filePath);
    const root = doc.getRoot();

    // Remove all meshes
    for (const mesh of root.listMeshes()) {
      mesh.dispose();
    }

    // Remove all materials
    for (const mat of root.listMaterials()) {
      mat.dispose();
    }

    // Remove all textures
    for (const tex of root.listTextures()) {
      tex.dispose();
    }

    // Remove all accessors not referenced by animations
    // (gltf-transform handles this via compact/prune automatically)

    // Remove skin references from nodes (meshes are gone)
    for (const node of root.listNodes()) {
      if (node.getMesh()) node.setMesh(null);
      if (node.getSkin()) node.setSkin(null);
    }

    // Remove all skins (bone-mesh binding data, not needed without mesh)
    for (const skin of root.listSkins()) {
      skin.dispose();
    }

    // Remove all bufferViews/accessors that are now orphaned
    // by writing back — gltf-transform auto-prunes on write
    await io.write(filePath, doc);

    const sizeAfter = fs.statSync(filePath).size;
    console.log(`  ${file}: ${(sizeBefore / 1024 / 1024).toFixed(1)}MB -> ${(sizeAfter / 1024).toFixed(0)}KB`);
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/strip-anim-meshes.js <character>|--all');
  process.exit(1);
}

const characters = arg === '--all'
  ? fs.readdirSync(CHARS_DIR).filter(d => fs.statSync(path.join(CHARS_DIR, d)).isDirectory())
  : [arg];

(async () => {
  for (const c of characters) {
    console.log(`Stripping meshes from ${c} animation clips…`);
    await stripCharacter(c);
  }
  console.log('Done.');
})();

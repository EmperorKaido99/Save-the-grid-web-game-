#!/usr/bin/env node
// Resizes textures inside GLB base models to max 512px and converts to JPEG.
// This can shrink 50MB models with 4K textures down to ~2-5MB.

const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { textureCompress } = require('@gltf-transform/functions');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHARS_DIR = path.join(ROOT, 'assets/models/characters');
const MAX_SIZE = 512; // max texture dimension

async function shrinkBase(name) {
  const filePath = path.join(CHARS_DIR, name, 'base.glb');
  if (!fs.existsSync(filePath)) return;

  const sizeBefore = fs.statSync(filePath).size;
  if (sizeBefore < 5 * 1024 * 1024) {
    console.log(`  skip (already small): ${name}/base.glb`);
    return;
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(filePath);
  const root = doc.getRoot();

  // Remove animations (loaded separately)
  for (const anim of root.listAnimations()) anim.dispose();

  // Manually resize each texture
  for (const texture of root.listTextures()) {
    const imageData = texture.getImage();
    if (!imageData) continue;

    try {
      const img = sharp(Buffer.from(imageData));
      const meta = await img.metadata();

      if (meta.width > MAX_SIZE || meta.height > MAX_SIZE) {
        const resized = await img
          .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        texture.setImage(new Uint8Array(resized));
        texture.setMimeType('image/jpeg');
        console.log(`    texture ${texture.getName() || '(unnamed)'}: ${meta.width}x${meta.height} -> ${MAX_SIZE}px (${(imageData.byteLength/1024).toFixed(0)}KB -> ${(resized.byteLength/1024).toFixed(0)}KB)`);
      }
    } catch (err) {
      console.warn(`    warn: couldn't resize texture: ${err.message}`);
    }
  }

  await io.write(filePath, doc);
  const sizeAfter = fs.statSync(filePath).size;
  console.log(`  ${name}/base.glb: ${(sizeBefore / 1024 / 1024).toFixed(1)}MB -> ${(sizeAfter / 1024 / 1024).toFixed(1)}MB`);
}

(async () => {
  const dirs = fs.readdirSync(CHARS_DIR).filter(d =>
    fs.statSync(path.join(CHARS_DIR, d)).isDirectory()
  );
  for (const name of dirs) {
    console.log(`Processing ${name}…`);
    await shrinkBase(name);
  }
  console.log('Done.');
})();

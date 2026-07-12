#!/usr/bin/env node
// Mixamo FBX -> GLB batch converter (Task 1 of docs/mixamo-animation-plan.md)
//
// Usage:
//   node scripts/convert-mixamo.js <character>     e.g. combat_worker
//   node scripts/convert-mixamo.js --all
//
// Reads filenames from assets/models/animation-manifest.json (never invents
// them), converts every FBX in assets/mixamo-raw/<character>/ one-to-one
// into assets/models/characters/<character>/. No Blender required.
// Requires: npm install (fbx2gltf is a devDependency).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'assets/models/animation-manifest.json');

function convertCharacter(name, manifest) {
  const entry = manifest[name];
  if (!entry) {
    console.error(`No manifest entry for "${name}". Known: ${Object.keys(manifest).filter(k => !k.startsWith('_')).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const rawDir = path.join(ROOT, 'assets/mixamo-raw', name);
  const outDir = path.join(ROOT, 'assets/models/characters', name);
  fs.mkdirSync(outDir, { recursive: true });

  let fbx2gltf;
  try {
    fbx2gltf = require('fbx2gltf');
  } catch {
    console.error('fbx2gltf is not installed. Run: npm install');
    process.exit(1);
  }

  const jobs = [entry.base, ...Object.values(entry.clips || {})];
  let done = 0, missing = 0;
  for (const job of jobs) {
    const src = path.join(rawDir, job.raw_filename);
    const dst = path.join(outDir, job.output_filename);
    if (!fs.existsSync(src)) {
      console.log(`  skip (not downloaded yet): ${path.relative(ROOT, src)}`);
      missing++;
      continue;
    }
    // fbx2gltf exports a path to the platform binary
    execFileSync(fbx2gltf, [
      '--binary',
      '--input', src,
      '--output', dst.replace(/\.glb$/, ''),
    ], { stdio: 'inherit' });
    console.log(`  ${job.raw_filename} -> ${path.relative(ROOT, dst)}`);
    done++;
  }
  console.log(`${name}: ${done} converted, ${missing} missing raw FBX files`);
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/convert-mixamo.js <character>|--all');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const characters = Object.keys(manifest).filter(k => !k.startsWith('_'));
for (const c of (arg === '--all' ? characters : [arg])) {
  console.log(`Converting ${c}…`);
  convertCharacter(c, manifest);
}

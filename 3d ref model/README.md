# 3D Reference Models

Place your 3D models (GLB/GLTF preferred) in the appropriate folders below.

## Supported Formats
- **GLB** (recommended) — binary GLTF, single file with textures baked in
- **GLTF** — JSON + separate bin/texture files
- **FBX** — common export from Blender/Maya
- **OBJ + MTL** — older format, widely available on Sketchfab

## Folder Structure

```
3d ref model/
├── station/              # Power station building, cooling towers, smokestacks
├── defenses/
│   ├── solar-panel/      # Solar panel models (levels 1-3)
│   ├── wind-turbine/     # Wind turbine models (levels 1-3)
│   ├── turret/           # Turret models (levels 1-3)
│   └── fence/            # Fence segments (basic, reinforced, electric)
├── enemies/
│   ├── looter/           # Basic looter character
│   ├── cable-thief/      # Fast cable thief character
│   └── vandal/           # Heavy vandal character
├── player/               # Power plant worker (hard hat, stun gun)
├── environment/
│   ├── props/            # Fences, light poles, barrels, debris, signs
│   └── terrain/          # Ground textures, roads, dirt patches
├── effects/              # Muzzle flash, explosions, electric sparks, shields
└── ui-icons/             # 2D icons for HUD (tower icons, currency, health)
```

## Asset Sources
- [Sketchfab](https://sketchfab.com) — check license per asset (CC-BY, CC0)
- [Kenney.nl](https://kenney.nl) — free CC0 game assets
- [Poly Pizza](https://poly.pizza) — free low-poly models
- Custom made in Blender

## Naming Convention
- Use lowercase with hyphens: `solar-panel-level-1.glb`
- Include level variants: `turret-level-1.glb`, `turret-level-2.glb`, `turret-level-3.glb`
- Animations should be embedded in the GLB file

# Mixamo Animation Plan — Save the Grid

Mapped directly against the current repo (`Player.js` CHARACTERS, `data/enemies.js`
ENEMY_TYPES). Search terms below are starting points for Mixamo's search bar —
Mixamo's catalog shifts over time and exact clip names vary, so treat these as
"search for this, pick the closest good one" rather than guaranteed exact hits.
Two are flagged below as genuinely not existing as a named clip — those need a
closest-fit substitute, tested for feel, not a literal name match.

---

## Part 1: The Mixamo Shopping List

### Combat Worker (player)
| Need | Search term to try | Notes |
|---|---|---|
| Idle | `Idle` | Base idle, standing relaxed |
| Walk | `Walking` | |
| Run/Sprint | `Running` | Matches your `sprinting` state at 1.65x speed |
| Aim idle (strafe stance) | `Rifle Aiming Idle` or `Pistol Idle` | Closest generic "weapon raised, ready" pose — stun gun isn't a Mixamo category, borrow from pistol/rifle idle |
| Aim walk/strafe | `Rifle Walk Forward` / `Strafe` | You already lock rotation to camera + slow to 0.55x when aiming — needs a strafing walk, not a turning walk |
| Fire/zap trigger | `Pistol Shoot` or `Standing Melee Attack 360` | Your fire is a ~0.25s cooldown snap, not a full reload — pick the shortest, punchiest clip you find, trim if needed |

### Repair Worker (player)
| Need | Search term to try | Notes |
|---|---|---|
| Idle | `Idle` | Can reuse Combat Worker's idle clip on the same rig |
| Walk | `Walking` | Reuse |
| Run/Sprint | `Running` | Reuse |
| Repair-loop | `Kneeling` or `Crouching Idle` | Mixamo doesn't have a "turning a wrench" clip specifically — kneeling/crouching loop reads fine with the wrench prop already in your geometry, motion doesn't need to match the tool literally |
| (Optional) self-defense zap | `Pistol Shoot` (reused, short) | Only needed if you wire up the unused `abilityDamage` fallback we flagged earlier |

### LOOTER (enemy)
| Need | Search term to try | Notes |
|---|---|---|
| Walk | `Zombie Walk` or `Walking` | "Zombie Walk" reads more menacing/opportunistic if you want a rougher gait than a clean walk cycle |
| Break-fence | `Standing Melee Attack Downward` or `Hammer Attack` | Smash/kick motion — doesn't need to visually match a fence specifically, just read as "breaking something" |
| Attack-station (generic) | `Punching` | |
| Death | `Dying` or `Falling Back Death` | |

### CABLE_THIEF (enemy)
| Need | Search term to try | Notes |
|---|---|---|
| Walk/Run | `Running` (already your fastest enemy at speed 5.5) | |
| Climb-over-fence | `Climbing` | **Flagged: no exact "vault a chain-link fence" clip exists.** Generic climbing clips exist but are known to have root-motion drift issues (the character can end up floating instead of landing where you place it) — this one needs hands-on testing in Blender before you trust it, budget extra time here specifically |
| Attack-defense (steal motion) | `Grab` or `Picking Up Object` | |
| Death | `Dying` | Reuse Looter's death if it doesn't need to be unique |

### VANDAL (enemy)
| Need | Search term to try | Notes |
|---|---|---|
| Walk (slow) | `Walking` (played at reduced playback rate to sell "slow but tough" at speed 1.8) | |
| Heavy-attack | `Sledgehammer Attack` or `Two Handed Sword Slash` | Your hammer prop is already geometrically attached at the hand position in `EnemyManager.js` — needs a clip with a big committed swing, not a quick jab |
| Death | `Dying` | Can share with the others if budget/time is tight |

### Not a Mixamo job
- **Wind turbine blades** — plain looped mesh rotation in Three.js, not a rigged animation
- **Fence break visual** — particle/dissolve swap in `DefenseManager.js`, not a character clip

---

## Part 2: Build Prompt for Claude Code

Paste the block below into Claude Code once the Mixamo downloads are done.

```
Implement the Mixamo → Three.js animation pipeline for Save the Grid and wire
it into the existing Player.js and EnemyManager.js state machines.

CONTEXT
- Sketchfab source meshes are GLB. Mixamo only accepts/exports FBX, not GLB.
- The pipeline is: Sketchfab GLB → Blender (import) → export FBX → Mixamo
  auto-rig + apply animation → download FBX ("with skin" once per character,
  "without skin" for every additional clip on that same rig) → Blender
  (import all FBX clips onto the one skinned mesh) → export a single merged
  GLB per character containing every animation clip as a separate
  AnimationClip.
- Do this once per unique rig: Combat Worker, Repair Worker (can likely
  share the Combat Worker's base body + idle/walk/run, only needs its own
  repair-loop clip), Looter, Cable Thief, Vandal. Confirm with me before
  assuming any two enemies can share a skeleton — their scale differs
  per `data/enemies.js` (LOOTER scale 1.0, CABLE_THIEF 0.85, VANDAL 1.3)
  so double check whether that's a uniform scale on the same rig (fine) or
  requires separate meshes (not fine to share animation data blindly).

TASK 1 — Conversion pipeline (no Blender required)
Install FBX2glTF as a dev dependency (`npm install fbx2gltf --save-dev`) —
this is a standalone command-line converter, no GUI 3D software needed.
Write a small Node script that loops over every FBX file in a character's
`assets/mixamo-raw/<character>/` folder and converts each one individually
to its own GLB in `assets/models/characters/<character>/`, using the exact
filenames specified in `assets/models/animation-manifest.json` (do not
invent filenames — read them from the manifest). Do not merge clips onto one
armature during conversion — one FBX in, one GLB out, per file.

Blender is NOT needed for this step. It only becomes relevant later if: a
specific character's Sketchfab source mesh turns out to have a genuinely
broken rest pose (rare — check first before assuming this is needed), or if
the human wants the precision hand-socket-Empty technique for prop
attachment instead of the runtime-offset fallback (see
claude-code-master-prompt.md Task 3). Do not add a Blender dependency to
this pipeline unless one of those specific cases comes up.

The merge of separate clips still happens at RUNTIME in Three.js, not at
conversion time: load base.glb once for the SkinnedMesh + skeleton, then for
every other clip GLB, load it and extract only `.animations[0]` (discard its
mesh/skeleton — it's structurally identical to base.glb since both came from
the same Mixamo auto-rig). Build one THREE.AnimationMixer targeting the base
mesh's root, and register each clip via `mixer.clipAction(clip)`. This works
because Three.js matches animation tracks to a target by bone name, not by
which file they came from.

This conversion script is reusable — I will run it again for every
character.

TASK 2 — Replace primitive meshes with animated GLB models
Player.js currently builds the Combat Worker and Repair Worker out of raw
THREE.Mesh primitives (cylinders, spheres, boxes) in `_buildCombatWorker()`
and `_buildRepairWorker()`. Replace these with GLTFLoader-loaded animated
models, but KEEP all existing movement/physics/state logic in Player.js
untouched — you're swapping what gets rendered, not how movement, aiming,
cooldowns, or character-switching work. The existing bob/lean/rotation logic
should either be removed in favor of real animation driving those visuals,
or kept as a supplementary effect — tell me which you think reads better
once you see it running, don't just silently pick one.

TASK 3 — AnimationMixer state wiring
Add a THREE.AnimationMixer per character, and drive clip selection from the
existing state already computed each frame in Player.js's `update()`:
`this.moving`, `this.sprinting`, `aiming` (passed in), `this.isRepairing`.
Crossfade between clips (don't hard-cut) — moving/sprinting/idle transitions
in particular need to blend, not pop.

TASK 4 — Enemy animation wiring
Same pattern in EnemyManager.js: replace the primitive-geometry enemy bodies
with animated GLB models, add a per-enemy AnimationMixer, and drive clip
selection from the existing state machine (walking toward target vs.
attacking vs. stunned). This is where the Looter/Cable-Thief fence-behavior
split needs to land too — add a `fenceBehavior: 'break' | 'climb'` field to
`data/enemies.js`, and branch the blocking-fence logic in EnemyManager.js's
update loop so climbers play the climb clip and cross without destroying the
fence, while breakers play the break clip and damage it like today.

TASK 5 — Report back before wiring cable-thief climbing
The Mixamo climb clip is flagged as having potential root-motion drift (see
Mixamo Animation Plan doc). Before wiring it into gameplay logic that assumes
the enemy ends up on the other side of the fence at a predictable position,
test the raw clip in isolation and report what you observe — if it drifts,
we need a decision (strip root motion and drive position manually via code,
or find a different clip) rather than shipping a fence-crossing enemy that
ends up somewhere wrong.

DO NOT mark any of this done until:
- Every character/enemy in the tables above has a working idle/walk/run at
  minimum — attack/death clips can lag behind if time is short, but base
  locomotion for all five rigs is the bar for "animation pipeline works."
- The camera-transition and movement feel from the existing player-controller
  prompt is not regressed — test god-mode/character-mode switching still
  feels the same after models change.
```

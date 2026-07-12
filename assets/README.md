# Asset Folder Convention — Save the Grid

Drop this into your project's root (merges with any existing `/assets`
folder — check for conflicts with what's already there before overwriting).

```
assets/
  mixamo-raw/              <- staging area, raw Mixamo FBX downloads land here
    combat_worker/
    repair_worker/
    looter/
    cable_thief/
    vandal/
  models/
    animation-manifest.json  <- ground truth: clip -> filename -> gameplay hook
    characters/               <- converted GLBs land here, one folder per character
      combat_worker/
      repair_worker/
      looter/
      cable_thief/
      vandal/
    props/                    <- static environment/defense models (station,
                                 solar panel, wind turbine, fence, etc. — see
                                 asset-list.md)
    loot/                     <- the solar-panel/wind-turbine "stolen goods"
                                 loot objects from claude-code-master-prompt.md
  LICENSES.md               <- one entry per third-party asset, per CLAUDE.md's
                                architecture rules
```

## Workflow

1. Download raw Mixamo FBX files into `mixamo-raw/<character>/`, named per
   `raw_filename` in `animation-manifest.json`.
2. Run the batch conversion script (Task 1 in `mixamo-animation-plan.md`)
   against a character's raw folder — it outputs individual GLBs into
   `models/characters/<character>/` using `output_filename` from the
   manifest.
3. Static environment/defense models (not part of the Mixamo pipeline) go
   straight into `models/props/`.
4. Point Claude Code at this whole folder plus `animation-manifest.json` —
   it has everything it needs to wire clips to state hooks without guessing
   filenames or naming conventions.

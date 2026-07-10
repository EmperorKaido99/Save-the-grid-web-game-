# Save the Grid ⚡

A satirical 3D tower-defense game built in Three.js, set at a South African power
station under siege — not by an army, but by looters and cable thieves, while
you, a lone power plant worker, try to keep the lights on.

Inspired by *Spellbreak*'s dual-perspective combat, **Save the Grid** blends
top-down "god mode" strategic planning with real-time third-person action.
It's part tower defense, part satire of load shedding, part low-key
renewable-energy PSA.

---

## The Pitch

Load shedding is a national pastime. *Save the Grid* leans into it: you're
not fighting monsters, you're fighting **looters and robbers** trying to strip
copper wire and vandalize your station. Your only weapons are a stun gun and
whatever renewable infrastructure you can afford to install between waves.

Every solar panel or wind turbine you place isn't just a turret — it's also a
tiny, genuine fact about how that tech actually helps the grid and the
environment. The joke is real, but so is the science.

## Core Concept

- **Two modes, one world, no loading screens.**
  - **God Mode** — top-down RTS camera. Available **between waves only**.
    Place solar panels / wind turbines (your "turrets"), spend Kilowatts (KW,
    your currency), review the field.
  - **Character Mode** — third-person action. Active **during waves**. You
    play the power plant worker, stun gun in hand, defending the station
    directly while your placed defenses do their part automatically.
  - Hotkey (`Tab`, placeholder) swaps modes — but only at the god-mode window
    between waves, not mid-fight (see Open Questions in the project doc for
    what's still being decided).

- **Setting:** A stylised South African power station. Load-shedding stage
  indicators, security lighting, chain-link fences, informal settlement
  silhouettes in the distance — real texture, played for satire not mockery.

- **Enemies:** Looters and robbers — human-scale, fast, opportunistic. No
  fantasy monsters. Different archetypes to be defined (see Open Questions).

- **Defenses:** Solar panels and wind turbines. Each placement:
  1. Costs Kilowatts (KW)
  2. Triggers a short, skippable "fun fact" popup about the real-world
     benefit of that tech
  3. Passively generates KW income once active (your economy engine)
  4. Also functions as a defensive structure against enemies

- **Player weapon:** Stun gun — non-lethal, thematically consistent (a power
  plant worker isn't a soldier).

- **Demo scope:** 5 waves, full loop (place → defend → survive → return to
  god mode → re-strategize → repeat).

## Tech Stack

- **Rendering:** Three.js
- **Physics:** Rapier (WASM) — chosen for closer conceptual parity with
  Godot/Unity physics, to ease a future port
- **Enemy steering/AI:** Yuka.js (candidate) + custom grid-based A* for
  pathing
- **3D Assets:** Sourced from Sketchfab (license-checked per asset) and
  custom-made where needed
- **Language:** Vanilla JS / ES modules (no framework lock-in, to keep the
  core game-state logic portable)

## Why Three.js First, Engine Later

This prototype is built with an explicit porting strategy: gameplay logic,
entity data, wave design, and economy rules live in plain JS/JSON, decoupled
from all Three.js rendering code. When/if this moves to Godot or Unity, the
*rendering* gets rebuilt natively, but the *design* — tower stats, wave
curves, targeting rules, economy balance — carries over directly. See
`CLAUDE.md` for the enforced architecture.

## Status

🚧 Pre-production / planning phase. No code yet — see `CLAUDE.md` for the
build plan, milestones, and the agents Claude Code will use once development
starts.

## License

TBD.

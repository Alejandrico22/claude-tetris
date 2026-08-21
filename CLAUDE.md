# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file clone of the arcade classic **Tetris**, built with HTML5 Canvas and vanilla ES6+ JavaScript. No frameworks, no bundler, no dependencies, no package.json, no build step.

- `index.html` — page shell; two `<canvas>` elements (300×600 `board`, 120×120 `next-canvas`), HUD panel (score/lines/level), pause/game-over overlay, and loads `game.js`
- `style.css` — dark/retro arcade styling: flexbox layout, monospace HUD, `backdrop-filter` overlays
- `game.js` — the entire game (board model, pieces, collision, rotation, scoring, rendering, main loop) — ~300 lines
- `README.md` — user-facing docs in Spanish (controls, mechanics, tunable constants)

## Running it

Open `index.html` directly in a browser, or serve it locally:

```bash
npx serve .
# or: python3 -m http.server 8000
# or: php -S localhost:8000
```

There is no build, lint, or test tooling in this repo — verify changes by reloading the page in a browser.

## Architecture (all in `game.js`)

- **Board model**: `board` is a `ROWS × COLS` (20×10) matrix of `0` (empty) or a color index `1–8` identifying which piece type locked there. `COLORS[0]` is `null` (unused/empty sentinel).
- **Pieces**: the 7 standard tetrominoes plus one special piece (type `8`, `RING_TYPE`) are defined in `PIECES` as square matrices (index 0 unused, matching `COLORS`). The ring is a 3×3 shape fully filled except its center cell — that center becomes a permanently unreachable empty cell once locked into `board` (it's enclosed by the ring's own blocks), so any row containing it can never be cleared. `randomPiece()` rolls the ring with `RING_CHANCE` probability, otherwise picks uniformly among types `1..RING_TYPE-1`. A piece object is `{ type, shape, x, y }` where `shape` is the current (possibly rotated) matrix and `x, y` is the top-left offset on the board. Keep `PIECES` and `COLORS` index-aligned when adding/changing piece types.
- **Rotation**: `rotateCW(shape)` computes a new matrix via transpose + row reversal — it does not mutate in place. `tryRotate()` applies it to `current`, then attempts a small set of wall-kick offsets (`[0, -1, 1, -2, 2]` columns) via `collide()`, keeping the first that doesn't collide and silently no-opping if none work.
- **Collision** (`collide(shape, ox, oy)`): true if any filled cell of `shape` at offset `(ox, oy)` is out of bounds (left/right/bottom — top is unbounded, allowing spawn above the visible board) or overlaps an already-locked board cell. Used for movement, rotation, ghost-piece projection, and hard/soft drop.
- **Locking flow**: `lockPiece()` → `merge()` (writes `current.shape` into `board`) → `clearLines()` → `spawn()` (promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the new piece immediately collides at spawn).
- **Line clearing** (`clearLines`): scans bottom-to-top; a full row is spliced out and an empty row unshifted at the top (re-checking the same index `r` afterward since rows shifted down). Awards `LINE_SCORES[cleared] * level` and recomputes `level` (`floor(lines / 10) + 1`) and `dropInterval` (`max(100, 1000 - (level-1)*90)` ms).
- **Drop mechanics**: gravity drop happens in `loop()` when accumulated `dt` exceeds `dropInterval`. `softDrop()` (↓ key) moves down one row and adds 1 point, or locks if it can't. `hardDrop()` (Space) projects to `ghostY()` instantly, awards 2 points per row descended, and locks immediately.
- **Ghost piece**: `ghostY()` walks `current.y` down via `collide()` until blocked; `draw()` renders the projected shape at `globalAlpha = 0.2` before the real piece.
- **Game loop** (`loop(ts)`): `requestAnimationFrame`-driven, accumulates raw `dt` (no clamping) into `dropAccum`, triggers gravity drop, then unconditionally redraws (`draw()` clears and repaints grid → locked board → ghost → current piece each frame).
- **State flags**: `paused` and `gameOver` are simple booleans gating `keydown` handling and the loop; `togglePause()` cancels/restarts the `requestAnimationFrame` chain and toggles the shared `overlay` element (also reused for the Game Over screen, distinguished only by `overlayTitle`/`overlayScore` text).
- **Input**: a single `keydown` listener switches on `e.code`; movement/rotation/drop calls are guarded by `if (paused || gameOver) return`, but `KeyP` (pause toggle) is checked first so it always works.
- `init()` (re)initializes all module-level game state and is also wired as the restart button's click handler — there is no separate reset path.

## Notes

- Code and comments are in Spanish (README) / minimal inline English comments in `game.js` — match existing convention when editing.
- Tunable constants live at the top of `game.js`: `COLS`, `ROWS`, `BLOCK` (cell size), `COLORS`, `LINE_SCORES`, initial `dropInterval`, `RING_CHANCE` (spawn probability of the special ring piece). If `COLS`/`ROWS`/`BLOCK` change, update the `board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK` by `ROWS × BLOCK`).

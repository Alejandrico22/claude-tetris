# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file clone of the arcade classic **Tetris**, built with HTML5 Canvas and vanilla ES6+ JavaScript. No frameworks, no bundler, no dependencies, no package.json, no build step.

- `index.html` — page shell; two `<canvas>` elements (300×600 `board`, 120×120 `next-canvas`), HUD panel (score/lines/level), three overlay screens (start/pause/game-over), and loads `game.js`
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

- **Board model**: `board` is a `ROWS × COLS` (20×10) matrix of `0` (empty) or a color index `1–8` identifying which piece type locked there. Index `0` of every skin's `colors` array is `null` (unused/empty sentinel).
- **Pieces**: the 7 standard tetrominoes plus one special piece (type `8`, `RING_TYPE`) are defined in `PIECES` as square matrices (index 0 unused). The ring is a 3×3 shape fully filled except its center cell — that center becomes a permanently unreachable empty cell once locked into `board` (it's enclosed by the ring's own blocks), so any row containing it can never be cleared. `randomPiece()` rolls the ring with `RING_CHANCE` probability, otherwise picks uniformly among types `1..RING_TYPE-1`. A piece object is `{ type, shape, x, y }` where `shape` is the current (possibly rotated) matrix and `x, y` is the top-left offset on the board. `PIECES` indices are piece-type ids, independent of any skin — keep every skin's `colors` array the same length and index-aligned with `PIECES` when adding/changing piece types.
- **Rotation**: `rotateCW(shape)` computes a new matrix via transpose + row reversal — it does not mutate in place. `tryRotate()` applies it to `current`, then attempts a small set of wall-kick offsets (`[0, -1, 1, -2, 2]` columns) via `collide()`, keeping the first that doesn't collide and silently no-opping if none work.
- **Collision** (`collide(shape, ox, oy)`): true if any filled cell of `shape` at offset `(ox, oy)` is out of bounds (left/right/bottom — top is unbounded, allowing spawn above the visible board) or overlaps an already-locked board cell. Used for movement, rotation, ghost-piece projection, and hard/soft drop.
- **Locking flow**: `lockPiece()` → `merge()` (writes `current.shape` into `board`) → `clearLines()` → `spawn()` (promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the new piece immediately collides at spawn).
- **Line clearing** (`clearLines`): scans bottom-to-top; a full row is spliced out and an empty row unshifted at the top (re-checking the same index `r` afterward since rows shifted down). Awards `LINE_SCORES[cleared] * level` and recomputes `level` (`floor(lines / 10) + 1`) and `dropInterval` (`max(100, 1000 - (level-1)*90)` ms).
- **Drop mechanics**: gravity drop happens in `loop()` when accumulated `dt` exceeds `dropInterval`. `softDrop()` (↓ key) moves down one row and adds 1 point, or locks if it can't. `hardDrop()` (Space) projects to `ghostY()` instantly, awards 2 points per row descended, and locks immediately.
- **Ghost piece**: `ghostY()` walks `current.y` down via `collide()` until blocked; `draw()` renders the projected shape at `globalAlpha = 0.2` before the real piece.
- **Game loop** (`loop(ts)`): `requestAnimationFrame`-driven, accumulates raw `dt` (no clamping) into `dropAccum`, triggers gravity drop, then redraws (`draw()` clears and repaints grid → locked board → ghost → current piece each frame) and stops rescheduling itself once `gameOver` is true.
- **Screens**: `screens` maps `start`/`pause`/`gameover` to three independent sibling elements (`#screen-start`, `#screen-pause`, `#screen-gameover`, all `.overlay`). `showScreen(name)` shows one and hides the other two; `hideScreens()` hides all three. Unlike a single shared overlay, each screen owns its own DOM subtree, so features specific to one (e.g. a highscore form on game over, a level selector in pause) don't collide with the others.
- **State flags**: `paused`, `gameOver`, and `menuOpen` are booleans gating `keydown` handling and the loop; `started` (false until the first `startGame()`) guards against reading `board`/`current`/`paused`/`gameOver` while they're still `undefined` on the start screen. `gameInputEnabled()` is the single predicate (`started && !paused && !gameOver && !menuOpen`) that movement/rotation/drop should check; `togglePause()` itself bails out early on `!started || gameOver`. `togglePause()` cancels/restarts the `requestAnimationFrame` chain and calls `showScreen('pause')` / `hideScreens()`.
- **Input**: a single `keydown` listener first bails out entirely if `document.activeElement` is an `INPUT`/`SELECT`/`TEXTAREA` (so typing into a highscore-name field or using a `<select>` never triggers game shortcuts), then switches on `e.code`. `KeyP` and `Escape` both toggle pause and are checked before the `gameInputEnabled()` guard so pause always works. Movement/rotation/drop calls are guarded by `if (!gameInputEnabled()) return`.
- **Skins**: `SKINS` is a registry of visual themes (`retro` is the only one defined so far, matching the original look exactly). Each entry owns `colors` (index-aligned with `PIECES`), `gridColor` (`{ dark, light }`), and a `drawBlock(context, x, y, colorIndex, size, alpha)` method. `activeSkin` points at the current entry; `drawBlock()`/`drawGrid()` always delegate to it, so adding a new skin means adding a registry entry and pointing `activeSkin` at it — no changes needed in `draw()`.
- **Persistence**: `loadJSON(key, fallback)` / `saveJSON(key, value)` wrap `localStorage` in `try/catch` (it can throw in private mode, with cookies blocked, or over quota) and JSON-encode values, falling back to the raw string if a stored value predates JSON encoding (theme migration). All persisted keys are prefixed `tetris-` (`tetris-theme`, `tetris-start-level`, …).
- **Per-game stats groundwork**: `combo`, `maxCombo`, `maxLines` are reset to `0` in `init()` on every new game; nothing updates them yet (`clearLines()` already returns the number of rows cleared for whoever wires combo tracking on top of it). `startLevel` is a persisted preference (`tetris-start-level`, default `1`) applied to `level` — and thus to the initial `dropInterval` — in `init()`.
- `init()` (re)initializes all module-level game state but does **not** start the loop. `startGame()` calls `init()`, hides all screens, and starts the `requestAnimationFrame` chain — it's wired to both the start screen's "Jugar" button and the game-over screen's restart button. On page load the start screen is shown and no game state exists until `startGame()` runs.

## Notes

- Code and comments are in Spanish (README) / minimal inline English comments in `game.js` — match existing convention when editing.
- Tunable constants live at the top of `game.js`: `COLS`, `ROWS`, `BLOCK` (cell size), `LINE_SCORES`, `RING_CHANCE` (spawn probability of the special ring piece), and the `SKINS` registry (piece colors, grid color, block rendering per skin). If `COLS`/`ROWS`/`BLOCK` change, update the `board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK` by `ROWS × BLOCK`).

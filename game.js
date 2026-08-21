'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // R - anillo con hueco central permanente
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const RING_TYPE = 8;      // índice del anillo en PIECES / skin.colors
const RING_CHANCE = 1/16; // probabilidad de que salga el anillo en randomPiece()

const THEME_STORAGE_KEY = 'tetris-theme';
const START_LEVEL_STORAGE_KEY = 'tetris-start-level';
const HIGHSCORES_STORAGE_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;
const SKIN_STORAGE_KEY = 'tetris-skin';

// Dibuja el trazado (sin fill/stroke) de un rectángulo de esquinas redondeadas en `context`.
// Definida una sola vez a nivel de módulo (no dentro de un drawBlock) porque draw() la
// invoca potencialmente cientos de veces por frame (una por celda del tablero) — crear un
// closure nuevo en cada llamada sería descartar trabajo de GC innecesario en ese hot path.
// La usa el skin "pastel"; cualquier otro skin con esquinas redondeadas puede reutilizarla.
function roundedRectPath(context, x0, y0, w0, h0, r0) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x0, y0, w0, h0, r0);
  } else {
    // Fallback manual (sin roundRect nativo): construye el rectángulo redondeado con arcTo.
    context.moveTo(x0 + r0, y0);
    context.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r0);
    context.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r0);
    context.arcTo(x0, y0 + h0, x0, y0, r0);
    context.arcTo(x0, y0, x0 + w0, y0, r0);
    context.closePath();
  }
}

// ---- Skins (apariencia del tablero) ----
// Registro de aspectos visuales. "retro" es el look original (sin cambios respecto a antes
// del refactor); "neon", "pastel" y "pixel" son variantes añadidas después. Cualquier skin
// nuevo solo necesita una entrada aquí con su propio `colors`, `gridColor` y `drawBlock`
// (y opcionalmente `boardBg` para forzar un fondo de tablero fijo); draw()/drawGrid() ya
// leen siempre de `activeSkin`, no hace falta tocarlos.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#64b5f6', // J - blue
      '#ffb74d', // L - orange
      '#f06292', // R (anillo) - rosa
    ],
    gridColor: { dark: '#22222e', light: '#c8c8d8' },
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },

  neon: {
    label: 'Neon',
    // Fondo negro puro forzado vía `boardBg` (ver draw()), independiente del tema claro/oscuro.
    boardBg: '#000000',
    colors: [
      null,
      '#00e5ff', // I - cyan neón
      '#ffea00', // O - amarillo neón
      '#e040fb', // T - magenta neón
      '#00e676', // S - verde neón
      '#ff1744', // Z - rojo neón
      '#2979ff', // J - azul neón
      '#ff9100', // L - naranja neón
      '#f50057', // R (anillo) - rosa neón
    ],
    gridColor: { dark: '#1a1a1a', light: '#1a1a1a' },
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      context.globalAlpha = alpha ?? 1;
      const color = this.colors[colorIndex];
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      context.shadowBlur = 0; // evita contaminar el siguiente dibujado (grid, otros bloques)
      context.fillStyle = 'rgba(255,255,255,0.25)';
      context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
      context.globalAlpha = 1;
    },
  },

  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#aee1e3', // I - celeste pastel
      '#fff2b2', // O - amarillo pastel
      '#d9bfe0', // T - lila pastel
      '#bfe3c0', // S - verde pastel
      '#f5c2c2', // Z - rojo pastel
      '#b9d0ec', // J - azul pastel
      '#f7d3ad', // L - naranja pastel
      '#f2c1de', // R (anillo) - rosa pastel
    ],
    gridColor: { dark: '#2a2a3a', light: '#dcdce8' },
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      context.globalAlpha = alpha ?? 1;
      const px = x * size + 2;
      const py = y * size + 2;
      const w = size - 4;
      const h = size - 4;
      const r = Math.min(6, w / 2, h / 2);

      context.fillStyle = this.colors[colorIndex];
      roundedRectPath(context, px, py, w, h, r);
      context.fill();

      // highlight suave en la mitad superior
      context.fillStyle = 'rgba(255,255,255,0.35)';
      roundedRectPath(context, px, py, w, Math.max(1, h / 2.5), r);
      context.fill();

      context.globalAlpha = 1;
    },
  },

  pixel: {
    label: 'Pixel',
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#64b5f6', // J - blue
      '#ffb74d', // L - orange
      '#f06292', // R (anillo) - rosa
    ],
    gridColor: { dark: '#22222e', light: '#c8c8d8' },
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      context.globalAlpha = alpha ?? 1;
      const px = x * size + 1;
      const py = y * size + 1;
      const w = size - 2;
      const h = size - 2;
      const sub = w / 4; // patrón de sub-celdas 4x4, estilo pixel-art/dithering

      context.fillStyle = this.colors[colorIndex];
      context.fillRect(px, py, w, h);

      // sub-celdas más oscuras (dithering)
      context.fillStyle = 'rgba(0,0,0,0.15)';
      for (let sr = 0; sr < 4; sr++) {
        for (let sc = 0; sc < 4; sc++) {
          if ((sr + sc) % 3 === 0) {
            context.fillRect(px + sc * sub, py + sr * sub, sub, sub);
          }
        }
      }

      // sub-celdas más claras (dithering)
      context.fillStyle = 'rgba(255,255,255,0.18)';
      for (let sr = 0; sr < 4; sr++) {
        for (let sc = 0; sc < 4; sc++) {
          if ((sr + sc) % 5 === 1) {
            context.fillRect(px + sc * sub, py + sr * sub, sub, sub);
          }
        }
      }

      // borde nítido tipo pixel-art
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);

      context.globalAlpha = 1;
    },
  },
};

let activeSkin = SKINS.retro; // el selector de skin (unidad 4) reasigna esto en caliente

// ---- Helper de localStorage ----
// Envuelve lectura/escritura en try/catch: localStorage puede lanzar en modo privado,
// con cookies bloqueadas o por cuota excedida. Si eso pasa, el juego sigue funcionando
// sin persistir preferencias en vez de romperse.
function loadJSON(key, fallback) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // compat: valor guardado como string plano antes de adoptar JSON (p.ej. tema legado)
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no persistimos; el juego sigue funcionando con el valor solo en memoria
  }
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const playBtn = document.getElementById('play-btn');
const restartBtn = document.getElementById('restart-btn');
const gameoverScoreEl = document.getElementById('gameover-score');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const pauseMainEl = document.getElementById('pause-main');
const pauseControlsEl = document.getElementById('pause-controls');
const pauseResumeBtn = document.getElementById('pause-resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseControlsBackBtn = document.getElementById('pause-controls-back-btn');
const startLevelSelect = document.getElementById('start-level-select');
const skinSelect = document.getElementById('skin-select');
const highscoresStartEl = document.getElementById('highscores-start');
const highscoresGameoverEl = document.getElementById('highscores-gameover');
const resetHighscoresBtn = document.getElementById('reset-highscores-btn');
const highscoreFormEl = document.getElementById('highscore-form');
const highscoreNameInput = document.getElementById('highscore-name-input');
const saveHighscoreBtn = document.getElementById('save-highscore-btn');

// ---- Gestor de pantallas ----
// Tres paneles hermanos e independientes (inicio / pausa / game over), en vez del
// antiguo #overlay único reescrito a base de cambiar su texto. Cada pantalla puede
// evolucionar su propio contenido (menú de pausa, tabla de records...) sin pisar a
// las demás. showScreen(null) o hideScreens() oculta las tres.
const screens = {
  start: document.getElementById('screen-start'),
  pause: document.getElementById('screen-pause'),
  gameover: document.getElementById('screen-gameover'),
};

function showScreen(name) {
  for (const key in screens) screens[key].classList.toggle('hidden', key !== name);
}

function hideScreens() {
  for (const key in screens) screens[key].classList.add('hidden');
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme;
let started = false; // true desde el primer startGame(); antes de eso board/current/paused/gameOver no existen todavía
let menuOpen;   // true mientras un submenú (pausa, controles...) debe bloquear el juego
let combo, maxCombo, maxLines; // estadísticas de la partida en curso (unidad 2 las alimenta, unidad 3 las lee al game over)

// Fuerza el valor a un entero 1–15 (rango del selector de nivel inicial). Protege contra
// un valor corrupto/fuera de rango en localStorage (editado a mano, o de una versión
// anterior con otro rango) que de otro modo dejaría `level`/`dropInterval` en NaN.
function clampStartLevel(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(15, Math.max(1, n));
}

let startLevel = clampStartLevel(loadJSON(START_LEVEL_STORAGE_KEY, 1)); // preferencia persistida; el selector de nivel la actualiza

function applyTheme(t) {
  theme = t;
  document.body.classList.toggle('light-theme', t === 'light');
  themeToggleBtn.textContent = t === 'light' ? '🌙 Oscuro' : '☀️ Claro';
  saveJSON(THEME_STORAGE_KEY, t);
}

function toggleTheme() {
  applyTheme(theme === 'light' ? 'dark' : 'light');
}

// Rellena el <select> con una opción por cada entrada de SKINS (fuente única de verdad).
function populateSkinSelect() {
  for (const key in SKINS) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = SKINS[key].label;
    skinSelect.appendChild(opt);
  }
}

// Resuelve una clave de skin a una clave válida y propia de SKINS, con fallback a 'retro'.
// hasOwnProperty evita que una clave arbitraria (p.ej. un valor legado/manipulado en
// localStorage como "constructor" o "toString") resuelva a una propiedad heredada de
// Object.prototype en vez de a un skin real.
function resolveSkinKey(key) {
  return Object.prototype.hasOwnProperty.call(SKINS, key) ? key : 'retro';
}

// Aplica un skin por su clave (con fallback a 'retro' si la clave no es válida) y, si hay
// una partida ya iniciada, fuerza un repintado inmediato del tablero y de la vista previa de
// "siguiente pieza". Si `started` es false (pantalla de inicio, sin `board`/`current`/`next`
// todavía) NO se llama a draw()/drawNext(): no hay nada que redibujar.
function applySkin(key) {
  activeSkin = SKINS[resolveSkinKey(key)];
  if (started) {
    draw();
    drawNext();
  }
}

function changeSkin() {
  applySkin(skinSelect.value);
  saveJSON(SKIN_STORAGE_KEY, skinSelect.value);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.random() < RING_CHANCE
    ? RING_TYPE
    : Math.floor(Math.random() * (RING_TYPE - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > 1) score += 50 * combo * level; // bonus de combo a partir del 2º encadenado
    maxCombo = Math.max(maxCombo, combo);
    maxLines = Math.max(maxLines, cleared);
  } else {
    combo = 0;
  }
  updateHUD(); // única llamada: refleja combo/score tras clearLines(), que ya actualizó score/lines/level
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo > 1 ? `x${combo}` : '—';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  activeSkin.drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = activeSkin.gridColor[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Algunos skins (p.ej. neon) fuerzan un fondo propio independiente del tema claro/oscuro.
  if (activeSkin.boardBg) {
    ctx.fillStyle = activeSkin.boardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  // Igual que en draw(): si el skin fuerza un fondo propio, también debe aplicarse aquí
  // para que la vista previa de "siguiente pieza" no desentone con el tablero principal.
  if (activeSkin.boardBg) {
    nextCtx.fillStyle = activeSkin.boardBg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Tabla de records local ----
// Array de hasta MAX_HIGHSCORES objetos {name, score, lines, maxCombo, date},
// ordenado descendente por score, persistido en tetris-highscores vía loadJSON/saveJSON.
function loadHighscores() {
  return loadJSON(HIGHSCORES_STORAGE_KEY, []);
}

function saveHighscores(list) {
  saveJSON(HIGHSCORES_STORAGE_KEY, list);
}

// true si una partida con esta puntuación entraría en el top 5 actual
// (hay hueco libre, o supera estrictamente a la última entrada del top 5).
function qualifiesForHighscore(s) {
  const list = loadHighscores();
  if (list.length < MAX_HIGHSCORES) return true;
  return s > list[list.length - 1].score;
}

// Inserta `entry` en la tabla, reordena por score descendente y recorta a MAX_HIGHSCORES.
function addHighscore(entry) {
  const list = loadHighscores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_HIGHSCORES);
  saveHighscores(list);
  return list;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Renderiza la tabla de records dentro de `container` (se usa tanto en #screen-start
// como en #screen-gameover). Si `highlightDate` coincide con el `date` (ISO, con
// milisegundos) de una fila, se le añade la clase highscore-row--new para resaltarla.
// Se compara por valor (no por referencia) porque loadHighscores() siempre parsea JSON
// de nuevo desde localStorage, así que nunca sería el mismo objeto en memoria. No lee
// ninguna variable de partida en curso: solo depende de lo ya guardado en localStorage.
function renderHighscores(container, highlightDate) {
  const list = loadHighscores();
  if (!list.length) {
    container.innerHTML = '<p class="highscores-empty">Sin records todavía</p>';
    return;
  }
  let html = '<table class="highscores-table-el"><thead><tr>' +
    '<th>#</th><th>Nombre</th><th>Puntos</th><th>Líneas</th><th>Combo</th><th>Fecha</th>' +
    '</tr></thead><tbody>';
  list.forEach((entry, i) => {
    const isNew = highlightDate && entry.date === highlightDate;
    html += `<tr class="${isNew ? 'highscore-row--new' : ''}">` +
      `<td>${i + 1}</td>` +
      `<td>${escapeHtml(entry.name)}</td>` +
      `<td>${entry.score.toLocaleString()}</td>` +
      `<td>${entry.lines}</td>` +
      `<td>${entry.maxCombo}</td>` +
      `<td>${new Date(entry.date).toLocaleDateString()}</td>` +
      '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Handler del botón "Guardar" del formulario de nuevo record en game over.
// lines/maxCombo son las variables globales de la partida recién terminada
// (endGame() las deja intactas hasta el próximo init()).
function saveHighscoreEntry() {
  if (saveHighscoreBtn.disabled) return; // evita duplicar la entrada con un doble clic
  saveHighscoreBtn.disabled = true;
  const name = (highscoreNameInput.value || '').trim().slice(0, 12) || 'Jugador';
  const entryDate = new Date().toISOString();
  addHighscore({ name, score, lines, maxCombo, date: entryDate });
  highscoreFormEl.classList.add('hidden');
  renderHighscores(highscoresGameoverEl, entryDate);
  renderHighscores(highscoresStartEl);
}

function resetHighscores() {
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  saveHighscores([]);
  renderHighscores(highscoresStartEl);
  renderHighscores(highscoresGameoverEl);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  gameoverScoreEl.textContent = `Puntuación: ${score.toLocaleString()}`;
  showScreen('gameover');

  if (qualifiesForHighscore(score)) {
    highscoreNameInput.value = '';
    saveHighscoreBtn.disabled = false;
    highscoreFormEl.classList.remove('hidden');
  } else {
    highscoreFormEl.classList.add('hidden');
  }
  renderHighscores(highscoresGameoverEl);
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  if (!paused) {
    menuOpen = false;
    hideScreens();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMain(); // el menú de pausa siempre abre en las opciones principales
    showScreen('pause');
  }
}

// Sub-vistas dentro del menú de pausa: opciones principales <-> lista de controles.
// Mismo patrón que showScreen()/screens: un registro + una función que muestra una y
// oculta las demás, así una futura tercera sub-vista no obliga a tocar las existentes.
const pauseViews = { main: pauseMainEl, controls: pauseControlsEl };

function showPauseView(name) {
  for (const key in pauseViews) pauseViews[key].classList.toggle('hidden', key !== name);
}

// menuOpen se usa aquí para que Escape/P, mientras se ven los controles, vuelvan a las
// opciones principales del menú en vez de cerrar la pausa (ver keydown más abajo).
function showPauseMain() {
  menuOpen = false;
  startLevelSelect.value = String(startLevel); // refleja el valor actual de la variable
  showPauseView('main');
}

function showPauseControls() {
  menuOpen = true;
  showPauseView('controls');
}

// Cambia el nivel con el que empezará la PRÓXIMA partida (init() ya lee startLevel).
// Actualiza la variable en memoria Y persiste, para que el cambio se aplique sin recargar.
function handleStartLevelChange(e) {
  startLevel = clampStartLevel(e.target.value);
  saveJSON(START_LEVEL_STORAGE_KEY, startLevel);
}

// True si el juego debe aceptar teclas de movimiento/rotación/caída ahora mismo.
function gameInputEnabled() {
  return started && !paused && !gameOver && !menuOpen;
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // evita reprogramar el loop tras un Game Over disparado por lockPiece()
  animId = requestAnimationFrame(loop);
}

// Resetea todo el estado de una partida nueva. No arranca el bucle: eso lo hace startGame().
function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  maxLines = 0;
  paused = false;
  gameOver = false;
  menuOpen = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  next = randomPiece();
  spawn();
  updateHUD();
}

// Punto de entrada para "Jugar" / "Reiniciar": resetea el estado y arranca el bucle.
function startGame() {
  init();
  started = true;
  hideScreens();
  lastTime = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  const active = document.activeElement;
  // Mientras se escribe en un campo de texto (p.ej. el nombre en la tabla de records),
  // no interceptamos NINGUNA tecla del juego, ni siquiera P/Esc, para no robarle letras
  // al texto que el usuario está escribiendo.
  const typingText = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (typingText) return;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Si estamos en la sub-vista de controles dentro de la pausa, primero volvemos a las
    // opciones principales del menú en vez de cerrar la pausa directamente. P/Esc deben
    // funcionar siempre aquí, incluso con el <select> de nivel enfocado (a diferencia de
    // un campo de texto, un <select> no "escribe" letras al pulsarlas).
    if (started && paused && menuOpen) {
      showPauseMain();
    } else {
      togglePause();
    }
    return;
  }
  // Fuera de P/Esc, un <select> enfocado (p.ej. el selector de nivel) sí debe seguir
  // recibiendo sus propias teclas (flechas) sin que el juego las intercepte.
  if (active && active.tagName === 'SELECT') return;
  if (!gameInputEnabled()) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

playBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
themeToggleBtn.addEventListener('click', toggleTheme);
pauseResumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', startGame);
pauseControlsBtn.addEventListener('click', showPauseControls);
pauseControlsBackBtn.addEventListener('click', showPauseMain);
startLevelSelect.addEventListener('change', handleStartLevelChange);
skinSelect.addEventListener('change', changeSkin);
resetHighscoresBtn.addEventListener('click', resetHighscores);
saveHighscoreBtn.addEventListener('click', saveHighscoreEntry);
highscoreNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); saveHighscoreEntry(); }
});

applyTheme(loadJSON(THEME_STORAGE_KEY, 'dark'));
startLevelSelect.value = String(startLevel); // refleja la preferencia persistida desde el arranque

populateSkinSelect();
// Restaura el skin guardado, con fallback a 'retro' si no hay clave guardada o ya no es válida.
// `started` sigue siendo false aquí, así que applySkin() solo fija `activeSkin` sin repintar.
const savedSkinKey = loadJSON(SKIN_STORAGE_KEY, 'retro');
skinSelect.value = resolveSkinKey(savedSkinKey);
applySkin(savedSkinKey);

showScreen('start');
renderHighscores(highscoresStartEl); // puebla la tabla de records ya en la pantalla de inicio

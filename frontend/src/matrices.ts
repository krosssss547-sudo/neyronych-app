// Генератор задач для темы «Матрицы» + профиль игрока (ранг и разбор по типам закономерностей).
// Все задачи создаются на лету, поэтому они не повторяются.

export type Level = 1 | 2 | 3

export type MatrixPuzzle = {
  kind: string        // тип закономерности (для статистики)
  kindLabel: string   // название типа для человека
  level: Level
  question: string
  cells: string[]     // клетки поля, последняя — «?»
  cols: number        // сколько клеток в строке
  options: string[]   // 4 варианта ответа
  correct: string
  explanation: string
  xp: number          // XP за верный ответ
  fastSeconds: number // за какое время ответ считается быстрым (+бонус)
}

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pickOne = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)]
const pickN = <T,>(arr: T[], n: number): T[] => shuffle(arr).slice(0, n)

const SHAPES = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '🔺', '🔷', '⭐', '💠']
const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️']
const ON = '⬛'
const OFF = '⬜'

const XP: Record<Level, number> = { 1: 10, 2: 15, 3: 25 }
const FAST: Record<Level, number> = { 1: 12, 2: 25, 3: 45 }

const LABELS: Record<string, string> = {
  alternate: 'Чередование',
  growth: 'Рост',
  arith: 'Числовой ряд',
  columns: 'Повтор в матрице',
  latin: 'Уникальность в строках',
  countshape: 'Фигура и количество',
  interleave: 'Два ряда сразу',
  summatrix: 'Числовая матрица',
  rotation: 'Вращение',
  mirror: 'Симметрия',
  diagonal: 'Два правила сразу',
  xor: 'Логика узоров',
  altops: 'Чередование действий',
  series3: 'Сложные ряды',
}

const numFiller = (correct: number) => () => String(Math.max(1, correct + rand(-10, 10)))

// full — все клетки, включая ответ (он последний); builder сам прячет его под «?»
function build(
  level: Level, kind: string, question: string, full: string[], cols: number,
  distractors: string[], explanation: string, filler?: () => string,
): MatrixPuzzle {
  const correct = full[full.length - 1]
  const cells = [...full.slice(0, -1), '?']
  const opts = [correct]
  for (const d of distractors) {
    if (opts.length >= 4) break
    if (!opts.includes(d)) opts.push(d)
  }
  let guard = 0
  while (opts.length < 4 && guard++ < 300) {
    const f = filler ? filler() : pickOne(SHAPES)
    if (!opts.includes(f)) opts.push(f)
  }
  if (opts.length < 4) throw new Error('not enough options for ' + kind)
  return {
    kind, kindLabel: LABELS[kind], level, question, cells, cols,
    options: shuffle(opts), correct, explanation, xp: XP[level], fastSeconds: FAST[level],
  }
}

// ───────── Лёгкий уровень ─────────

function genAlternate(): MatrixPuzzle {
  const p = rand(2, 3)
  const shapes = pickN(SHAPES, p)
  const seq = Array.from({ length: 6 }, (_, i) => shapes[i % p])
  const others = shuffle(SHAPES.filter((s) => !shapes.includes(s)))
  return build(1, 'alternate', 'Продолжи ряд', seq, 6, [...shapes, ...others],
    p === 2 ? 'Две фигуры чередуются по очереди' : 'Три фигуры повторяются по кругу')
}

function genGrowth(): MatrixPuzzle {
  const s = pickOne(SHAPES)
  const c0 = rand(1, 2)
  const full = [0, 1, 2, 3].map((i) => s.repeat(c0 + i))
  const dis = [c0 + 2, c0 + 4, c0 + 1, c0 + 5].filter((n) => n <= 6).map((n) => s.repeat(n))
  return build(1, 'growth', 'Сколько фигур будет в пустой клетке?', full, 4, dis,
    'В каждой следующей клетке фигур на одну больше')
}

function genArith(): MatrixPuzzle {
  const start = rand(1, 20)
  const step = rand(2, 7)
  const t = Array.from({ length: 6 }, (_, i) => start + i * step)
  const c = t[5]
  return build(1, 'arith', 'Продолжи числовой ряд', t.map(String), 6,
    [String(c + 1), String(c - 1), String(c + step), String(c - step)],
    `Каждое число больше предыдущего на ${step}`, numFiller(c))
}

function genColumns(): MatrixPuzzle {
  const sh = pickN(SHAPES, 3)
  const byRow = Math.random() < 0.5
  const cells: string[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(byRow ? sh[c] : sh[r])
  return build(1, 'columns', 'Какая фигура пропущена?', cells, 3, shuffle(sh),
    byRow ? 'Каждая строка выглядит одинаково: одни и те же фигуры в одном порядке'
      : 'Каждая строка состоит из одной и той же фигуры')
}

// ───────── Средний уровень ─────────

function genLatin(): MatrixPuzzle {
  const sh = pickN(SHAPES, 3)
  const rows = shuffle([0, 1, 2]).map((r) => [0, 1, 2].map((c) => sh[(r + c) % 3]))
  const others = shuffle(SHAPES.filter((s) => !sh.includes(s)))
  return build(2, 'latin', 'Какая фигура должна стоять на месте вопроса?', rows.flat(), 3,
    [...sh, ...others],
    'В каждой строке и в каждом столбце каждая фигура встречается ровно один раз')
}

function genCountShape(): MatrixPuzzle {
  const sh = pickN(SHAPES, 3)
  const transposed = Math.random() < 0.5
  const cells: string[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(transposed ? sh[c].repeat(r + 1) : sh[r].repeat(c + 1))
  const dis = [sh[2].repeat(2), sh[1].repeat(3), sh[2].repeat(4), sh[0].repeat(3), sh[2].repeat(1)]
  return build(2, 'countshape', 'Что должно быть в пустой клетке?', cells, 3, dis,
    transposed ? 'Столбец задаёт фигуру, а строка — сколько их (1, 2, 3)' : 'Строка задаёт фигуру, а столбец — сколько их (1, 2, 3)')
}

function genInterleave(hard: boolean): MatrixPuzzle {
  const mag = () => rand(2, hard ? 7 : 4)
  const da = hard && Math.random() < 0.5 ? -mag() : mag()
  let db = Math.random() < 0.5 ? -mag() : mag()
  if (!hard && da === db) db = -db
  const a0 = da > 0 ? rand(1, 15) : rand(30, 60)
  const b0 = db > 0 ? rand(1, 15) : rand(30, 60)
  const A = (i: number) => a0 + i * da
  const B = (i: number) => b0 + i * db
  const full = [A(0), B(0), A(1), B(1), A(2), B(2), A(3)]
  const c = A(3)
  const dis = [B(3), c + da, c - da, A(2) + B(2)]
  const word = (d: number) => (d > 0 ? `растёт на ${d}` : `уменьшается на ${-d}`)
  return build(hard ? 3 : 2, 'interleave', 'Числа идут вперемешку. Что дальше?', full.map(String), 4,
    dis.map(String),
    `Здесь два ряда, идущих вперемешку: на 1, 3, 5, 7-м местах число ${word(da)}, на 2, 4, 6-м — ${word(db)}`,
    numFiller(c))
}

type Op = '+' | '−' | '×'
const applyOp = (op: Op, a: number, b: number) => (op === '+' ? a + b : op === '−' ? a - b : a * b)
const OP_WORD: Record<Op, string> = { '+': 'плюс', '−': 'минус', '×': 'умножить на' }

function genSumMatrix(): MatrixPuzzle {
  const ops: Op[] = ['+', '−', '×']
  const op = pickOne(ops)
  const mkRow = (): [number, number, number] => {
    let a: number, b: number
    if (op === '+') { a = rand(1, 12); b = rand(1, 12) }
    else if (op === '−') { a = rand(6, 20); b = rand(1, a - 1) }
    else { a = rand(2, 7); b = rand(2, 7) }
    return [a, b, applyOp(op, a, b)]
  }
  let rows: [number, number, number][] = []
  for (let tries = 0; tries < 60; tries++) {
    rows = [mkRow(), mkRow(), mkRow()]
    // чтобы правило определялось однозначно, другие действия не должны подходить к первым двум строкам
    const fitsOther = ops.some((o) => o !== op && rows.slice(0, 2).every(([a, b, c]) => applyOp(o, a, b) === c))
    if (!fitsOther) break
  }
  const [a, b, c] = rows[2]
  const dis = ops.filter((o) => o !== op).map((o) => applyOp(o, a, b)).concat([c + 1, c - 1, c + 2])
  return build(2, 'summatrix', 'Найди число вместо вопроса', rows.flat().map(String), 3,
    dis.map(String), `В каждой строке третье число = первое ${OP_WORD[op]} второе`, numFiller(c))
}

function genRotation(hard: boolean): MatrixPuzzle {
  const step = hard ? pickOne([3, 5]) : pickOne([1, 2, 6, 7])
  const start = rand(0, 7)
  const idx = Array.from({ length: 6 }, (_, i) => (start + i * step) % 8)
  const prev = idx[4]
  const wrongSteps = shuffle([1, 2, 3, 4, 5, 6, 7].filter((s) => s !== step))
  const dis = wrongSteps.map((s) => ARROWS[(prev + s) % 8])
  const deg = step <= 4 ? step * 45 : (8 - step) * 45
  const dir = step <= 4 ? 'по часовой стрелке' : 'против часовой стрелки'
  return build(hard ? 3 : 2, 'rotation', 'Стрелка вращается. Куда она смотрит дальше?', idx.map((i) => ARROWS[i]), 6, dis,
    `Каждая следующая стрелка повёрнута на ${deg}° ${dir}`, () => pickOne(ARROWS))
}

function genMirror(): MatrixPuzzle {
  const k = rand(3, 4)
  const sh = pickN(SHAPES, k)
  const full = [...sh, ...[...sh].reverse()]
  const others = shuffle(SHAPES.filter((s) => !sh.includes(s)))
  return build(2, 'mirror', 'Ряд симметричен. Что в пустой клетке?', full, k === 3 ? 6 : 4,
    [...shuffle(sh.slice(1)), ...others],
    'Вторая половина ряда — зеркальное отражение первой')
}

// ───────── Сложный уровень ─────────

function genDiagonal(): MatrixPuzzle {
  const sh = pickN(SHAPES, 3)
  const byCol = Math.random() < 0.5
  const cells: string[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(sh[(r + c) % 3].repeat(byCol ? c + 1 : r + 1))
  const dis = [sh[1].repeat(2), sh[2].repeat(3), sh[0].repeat(3), sh[1].repeat(4), sh[1].repeat(1)]
  return build(3, 'diagonal', 'Здесь работают сразу два правила. Что в пустой клетке?', cells, 3, dis,
    byCol
      ? 'Количество фигур равно номеру столбца (1, 2, 3), а вид фигуры сдвигается по кругу с каждой строкой'
      : 'Количество фигур равно номеру строки (1, 2, 3), а вид фигуры сдвигается по кругу с каждой строкой')
}

function genXor(): MatrixPuzzle {
  const sym = (b: number) => (b ? ON : OFF)
  const cellStr = (bits: number[]) => `${sym(bits[0])}${sym(bits[1])}\n${sym(bits[2])}${sym(bits[3])}`
  const randBits = () => Array.from({ length: 4 }, () => rand(0, 1))
  let rows: number[][][] = []
  for (let tries = 0; tries < 400; tries++) {
    rows = [0, 1, 2].map(() => {
      const a = randBits(), b = randBits()
      return [a, b, a.map((x, i) => x ^ b[i])]
    })
    // в первых двух строках должны встретиться все 4 пары значений — тогда правило определяется однозначно
    const seen = new Set<number>()
    for (const r of rows.slice(0, 2)) for (let i = 0; i < 4; i++) seen.add(r[0][i] * 2 + r[1][i])
    if (seen.size === 4) break
  }
  const answer = rows[2][2]
  const flips = shuffle([0, 1, 2, 3]).map((i) => cellStr(answer.map((x, j) => (j === i ? 1 - x : x))))
  return build(3, 'xor', 'Какой узор должен быть на месте вопроса?', rows.flat().map(cellStr), 3, flips,
    `В третьем столбце ${ON} стоит там, где в первых двух узорах клетки разные, а ${OFF} — где одинаковые`,
    () => cellStr(randBits()))
}

function genAltOps(): MatrixPuzzle {
  const s = rand(2, 6), d = rand(2, 6), m = rand(2, 3)
  const t = [s]
  for (let i = 1; i <= 6; i++) t.push(i % 2 === 1 ? t[i - 1] + d : t[i - 1] * m)
  const c = t[6]
  const dis = [t[5] + d, t[5] * m + d, c - d, c + d, c - 1, c + 1]
  return build(3, 'altops', 'Продолжи ряд. Действия здесь чередуются', t.map(String), 4, dis.map(String),
    `Действия идут по очереди: +${d}, ×${m}, +${d}, ×${m}…`, numFiller(c))
}

function genSeries3(): MatrixPuzzle {
  if (Math.random() < 0.3) {
    const a = rand(1, 4), b = rand(1, 4)
    const t = [a, b]
    while (t.length < 7) t.push(t[t.length - 1] + t[t.length - 2])
    const c = t[6]
    return build(3, 'series3', 'Продолжи числовой ряд', t.map(String), 4,
      [String(t[5] * 2), String(t[5] + t[3]), String(c + 1), String(c - 1), String(c + 2)],
      'Каждое число равно сумме двух предыдущих', numFiller(c))
  }
  const s = rand(1, 10), d0 = rand(1, 5), k = rand(1, 3)
  const t = [s]
  for (let i = 0; i < 6; i++) t.push(t[i] + d0 + i * k)
  const c = t[6]
  const diffs = [0, 1, 2].map((i) => `+${d0 + i * k}`).join(', ')
  return build(3, 'series3', 'Продолжи числовой ряд', t.map(String), 4,
    [String(t[5] + (t[5] - t[4])), String(c - k), String(c + k), String(c + 1), String(c - 1)],
    `Разница между соседними числами каждый раз растёт на ${k}: ${diffs}…`, numFiller(c))
}

type Gen = { kind: string; gen: () => MatrixPuzzle }

const POOLS: Record<Level, Gen[]> = {
  1: [
    { kind: 'alternate', gen: genAlternate },
    { kind: 'growth', gen: genGrowth },
    { kind: 'arith', gen: genArith },
    { kind: 'columns', gen: genColumns },
  ],
  2: [
    { kind: 'latin', gen: genLatin },
    { kind: 'countshape', gen: genCountShape },
    { kind: 'interleave', gen: () => genInterleave(false) },
    { kind: 'summatrix', gen: genSumMatrix },
    { kind: 'rotation', gen: () => genRotation(false) },
    { kind: 'mirror', gen: genMirror },
  ],
  3: [
    { kind: 'diagonal', gen: genDiagonal },
    { kind: 'xor', gen: genXor },
    { kind: 'altops', gen: genAltOps },
    { kind: 'series3', gen: genSeries3 },
    { kind: 'interleave', gen: () => genInterleave(true) },
    { kind: 'rotation', gen: () => genRotation(true) },
  ],
}

let lastKind = ''

export function generateMatrix(level: Level): MatrixPuzzle {
  const pool = POOLS[level]
  const candidates = pool.filter((p) => p.kind !== lastKind)
  const chosen = pickOne(candidates)
  const puzzle = chosen.gen()
  lastKind = puzzle.kind
  return puzzle
}

// ───────── Профиль игрока: очки, ранг, разбор по типам ─────────

export type MatrixProfile = {
  points: number
  solved: number
  kinds: Record<string, { t: number; c: number }>
}

const PROFILE_KEY = 'neyronych_matrix_profile_v1'
export const POINTS_PER_LEVEL: Record<Level, number> = { 1: 10, 2: 20, 3: 35 }
export const FAST_BONUS_POINTS = 5
export const PERFECT_SERIES_POINTS = 50
export const FAST_BONUS_XP = 5

export function loadMatrixProfile(): MatrixProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        points: Number(p.points) || 0,
        solved: Number(p.solved) || 0,
        kinds: p.kinds && typeof p.kinds === 'object' ? p.kinds : {},
      }
    }
  } catch { /* localStorage может быть недоступен */ }
  return { points: 0, solved: 0, kinds: {} }
}

export function saveMatrixProfile(p: MatrixProfile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export function recordMatrixResult(p: MatrixProfile, kind: string, level: Level, ok: boolean, fast: boolean): MatrixProfile {
  const prev = p.kinds[kind] || { t: 0, c: 0 }
  return {
    points: p.points + (ok ? POINTS_PER_LEVEL[level] + (fast ? FAST_BONUS_POINTS : 0) : 0),
    solved: p.solved + (ok ? 1 : 0),
    kinds: { ...p.kinds, [kind]: { t: prev.t + 1, c: prev.c + (ok ? 1 : 0) } },
  }
}

export type Rank = { min: number; name: string; emoji: string }

export const RANKS: Rank[] = [
  { min: 0, name: 'Новичок', emoji: '🌱' },
  { min: 150, name: 'Наблюдатель', emoji: '👀' },
  { min: 500, name: 'Аналитик', emoji: '🔷' },
  { min: 1200, name: 'Стратег', emoji: '♟️' },
  { min: 2500, name: 'Мастер', emoji: '🧠' },
  { min: 5000, name: 'Гроссмейстер', emoji: '👑' },
]

export function getRank(points: number): { rank: Rank; next: Rank | null; progressPct: number; toNext: number } {
  let i = 0
  for (let k = 0; k < RANKS.length; k++) if (points >= RANKS[k].min) i = k
  const rank = RANKS[i]
  const next = RANKS[i + 1] || null
  if (!next) return { rank, next: null, progressPct: 100, toNext: 0 }
  return { rank, next, progressPct: Math.round(((points - rank.min) / (next.min - rank.min)) * 100), toNext: next.min - points }
}

export function kindLabel(kind: string): string {
  return LABELS[kind] || kind
}

// Сильная и слабая стороны по всем сыгранным задачам (нужно минимум 3 попытки по типу)
export function analyzeProfile(p: MatrixProfile): { best: { label: string; pct: number } | null; worst: { label: string; pct: number } | null } {
  const rows = Object.entries(p.kinds)
    .filter(([, v]) => v.t >= 3)
    .map(([k, v]) => ({ label: kindLabel(k), pct: Math.round((v.c / v.t) * 100), t: v.t }))
  if (rows.length === 0) return { best: null, worst: null }
  const sorted = [...rows].sort((a, b) => b.pct - a.pct || b.t - a.t)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  return {
    best: { label: best.label, pct: best.pct },
    worst: worst.label !== best.label && worst.pct < 80 ? { label: worst.label, pct: worst.pct } : null,
  }
}
// Игра «Скорость»: быстрые примеры с жёстким таймером.
// Семь видов: умножение, сложение/вычитание, деление, квадраты, «Верно?», кратные, «Что больше?».
// Числа считаются на лету, поэтому каждое задание новое; недавние примеры не повторяются.

import { rand, pickOne, shuffle, numberOptions, fmt, makeRecent } from './gamekit'
import { XP_BY_LEVEL } from './gametypes'
import type { GameTask, Level } from './gametypes'

export const SPEED_KINDS: Record<string, string> = {
  mul: 'Умножение',
  addsub: 'Сложение и вычитание',
  div: 'Деление',
  square: 'Квадраты',
  truefalse: 'Верно?',
  divisible: 'Кратные',
  bigger: 'Что больше?',
}

const MINUS = '−'

type Core = { question: string; correct: string; options: string[]; explanation: string; chip?: string }

const byLevel = <T,>(level: Level, a: T, b: T, c: T): T => (level === 1 ? a : level === 2 ? b : c)

// Недавние примеры (по всем видам сразу), чтобы не повторялись
const recent = makeRecent(30)
function fresh(key: string): boolean {
  if (recent.has(key)) return false
  recent.add(key)
  return true
}

// Поменять последние две цифры местами: 156 -> 165 (если получается «далеко» или с нулём впереди — не меняем)
function swapDigits(n: number): number {
  const s = String(n)
  if (s.length < 2) return n
  const i = s.length - 2
  const r = Number(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2))
  if (r < 10 ** (s.length - 1)) return n
  return r
}

// «Ловушки» — правдоподобные неверные ответы рядом с верным (далёкие отбрасываем)
function traps(c: number, extra: number[] = []): number[] {
  const t = [c + 1, c - 1, c + 2, c - 2, swapDigits(c), ...extra]
  if (c >= 25) t.push(c + 10, c - 10)
  const lim = Math.max(12, c * 0.4)
  return t.filter((x) => x > 0 && x !== c && Math.abs(x - c) <= lim)
}

function numOpts(correct: number, extra: number[], spread: number): string[] {
  return numberOptions(correct, traps(correct, extra), spread).map((s) => fmt(Number(s)))
}

// ───────── Умножение ─────────

function mulExplain(a: number, b: number, r: number): string {
  const big = Math.max(a, b)
  const small = Math.min(a, b)
  if (big < 10) return `${a} × ${b} = ${r}.`
  if (small < 10) {
    const t = big - (big % 10)
    const u = big % 10
    if (u === 0) return `${a} × ${b} = ${fmt(r)}.`
    return `${big} × ${small} = ${t * small} + ${u * small} = ${fmt(r)}.`
  }
  const t = small - (small % 10)
  const u = small % 10
  if (u === 0) return `${big} × ${small / 10} × 10 = ${fmt(r)}.`
  return `${big} × ${small} = ${fmt(big * t)} + ${fmt(big * u)} = ${fmt(r)}.`
}

function genMul(level: Level): Core {
  let a = 2
  let b = 2
  for (let i = 0; i < 25; i++) {
    if (level === 1) { a = rand(2, 9); b = rand(2, 9) }
    else if (level === 2) { a = rand(11, 19); b = rand(2, 9) }
    else {
      a = rand(11, 30); b = rand(11, 30)
      if (a % 10 === 0 && b % 10 === 0) continue
    }
    if (fresh(`mul${Math.min(a, b)}x${Math.max(a, b)}`)) break
  }
  if (Math.random() < 0.5) [a, b] = [b, a]
  const r = a * b
  const extra = [(a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1)]
  return {
    question: `${a} × ${b} = ?`,
    correct: fmt(r),
    options: numOpts(r, extra, level === 1 ? 6 : 12),
    explanation: mulExplain(a, b, r),
  }
}

// ───────── Сложение и вычитание ─────────

type Arith = { a: number; b: number; op: '+' | '−'; r: number }

function arith(level: Level, op: '+' | '−'): Arith {
  let a = 0
  let b = 0
  if (level === 1) {
    a = rand(12, 89); b = rand(11, 89)
  } else if (level === 2) {
    a = rand(101, 989); b = rand(11, 99)
  } else {
    a = rand(101, 989); b = rand(101, 989)
  }
  if (op === '−') {
    if (b >= a) [a, b] = [b, a]
    if (a === b) a += 1
    return { a, b, op, r: a - b }
  }
  return { a, b, op, r: a + b }
}

function genAddSub(level: Level): Core {
  let x: Arith = arith(level, '+')
  for (let i = 0; i < 25; i++) {
    x = arith(level, Math.random() < 0.5 ? '+' : '−')
    if (fresh(`as${x.a}${x.op}${x.b}`)) break
  }
  const extra = [x.r + 10, x.r - 10]
  if (level >= 2 && x.r >= 400) extra.push(x.r + 100, x.r - 100)
  const check = x.op === '+' ? `${fmt(x.r)} ${MINUS} ${fmt(x.b)} = ${fmt(x.a)}` : `${fmt(x.r)} + ${fmt(x.b)} = ${fmt(x.a)}`
  return {
    question: `${fmt(x.a)} ${x.op} ${fmt(x.b)} = ?`,
    correct: fmt(x.r),
    options: numOpts(x.r, extra, level === 1 ? 8 : 15),
    explanation: `${fmt(x.a)} ${x.op} ${fmt(x.b)} = ${fmt(x.r)}. Проверка: ${check}.`,
  }
}

// ───────── Деление ─────────

function genDiv(level: Level): Core {
  let d = 2
  let q = 2
  for (let i = 0; i < 25; i++) {
    if (level === 1) { d = rand(2, 9); q = rand(2, 9) }
    else if (level === 2) {
      d = rand(3, 19)
      q = rand(Math.max(3, Math.ceil(50 / d)), Math.floor(400 / d))
    } else {
      d = rand(12, 45)
      q = rand(Math.max(6, Math.ceil(200 / d)), Math.floor(1500 / d))
    }
    if (fresh(`div${d}x${q}`)) break
  }
  const n = d * q
  return {
    question: `${fmt(n)} ÷ ${d} = ?`,
    correct: String(q),
    options: numberOptions(q, traps(q, [q + 3, q - 3]), level === 1 ? 4 : 8),
    explanation: `${q} × ${d} = ${fmt(n)}, поэтому ${fmt(n)} ÷ ${d} = ${q}.`,
  }
}

// ───────── Квадраты, кубы, корни ─────────

function genSquare(level: Level): Core {
  type Q = { key: string; question: string; ans: number; extra: number[]; explanation: string; spread: number }
  const make = (): Q => {
    if (level === 1) {
      const n = rand(2, 12)
      return { key: `sq${n}`, question: `${n}² = ?`, ans: n * n, extra: [(n - 1) ** 2, (n + 1) ** 2, n * (n + 1), n * (n - 1), 2 * n], explanation: `${n}² = ${n} × ${n} = ${n * n}.`, spread: 10 }
    }
    if (level === 2 && Math.random() < 0.3) {
      const n = rand(2, 6)
      return { key: `cu${n}`, question: `${n}³ = ?`, ans: n ** 3, extra: [(n - 1) ** 3, (n + 1) ** 3, n * n * 2, n * n + n, 3 * n, n * n * (n + 1)], explanation: `${n}³ = ${n} × ${n} × ${n} = ${n * n} × ${n} = ${n ** 3}.`, spread: 20 }
    }
    if (level === 2) {
      const n = rand(13, 25)
      return { key: `sq${n}`, question: `${n}² = ?`, ans: n * n, extra: [(n - 1) ** 2, (n + 1) ** 2, n * (n + 1), n * (n - 1)], explanation: `${n}² = ${n} × ${n} = ${n * n}.`, spread: 30 }
    }
    if (Math.random() < 0.4) {
      const n = rand(13, 50)
      return { key: `rt${n}`, question: `√${fmt(n * n)} = ?`, ans: n, extra: [n + 3, n - 3, n + 5, n - 5], explanation: `√${fmt(n * n)} = ${n}, потому что ${n}² = ${fmt(n * n)}.`, spread: 4 }
    }
    const n = rand(21, 35)
    return { key: `sq${n}`, question: `${n}² = ?`, ans: n * n, extra: [(n - 1) ** 2, (n + 1) ** 2, n * (n + 1), n * (n - 1)], explanation: `${n}² = ${n} × ${n} = ${fmt(n * n)}.`, spread: 40 }
  }
  let q = make()
  for (let i = 0; i < 25; i++) {
    q = make()
    if (fresh(q.key)) break
  }
  return {
    question: q.question,
    correct: fmt(q.ans),
    options: numOpts(q.ans, q.extra, q.spread),
    explanation: q.explanation,
  }
}

// ───────── «Верно?» ─────────

function genTrueFalse(level: Level): Core {
  let a = 0
  let b = 0
  let r = 0
  let op = '+'
  for (let i = 0; i < 25; i++) {
    const roll = Math.random()
    if (roll < 0.35) {
      const x = arith(level, '+'); a = x.a; b = x.b; r = x.r; op = '+'
    } else if (roll < 0.65) {
      const x = arith(level, '−'); a = x.a; b = x.b; r = x.r; op = MINUS
    } else {
      op = '×'
      if (level === 1) { a = rand(3, 9); b = rand(3, 9) }
      else if (level === 2) { a = rand(11, 19); b = rand(3, 9) }
      else { a = rand(12, 29); b = rand(6, 19) }
      r = a * b
    }
    if (fresh(`tf${a}${op}${b}`)) break
  }
  const isTrue = Math.random() < 0.5
  let shown = r
  if (!isTrue) {
    const deltas = op === '×'
      ? [1, -1, 2, -2, 10, -10, a, -a, b, -b]
      : level === 1 ? [1, -1, 2, -2, 10, -10] : level === 2 ? [1, -1, 2, -2, 10, -10, 20, -20] : [1, -1, 2, -2, 10, -10, 20, -20, 100, -100]
    for (let i = 0; i < 30; i++) {
      const d = pickOne(deltas)
      if (d !== 0 && r + d > 0) { shown = r + d; break }
    }
    if (shown === r) shown = r + 1
  }
  const eq = `${fmt(a)} ${op} ${fmt(b)} = ${fmt(r)}`
  return {
    chip: 'Верно ли равенство?',
    question: `${fmt(a)} ${op} ${fmt(b)} = ${fmt(shown)}`,
    correct: isTrue ? 'Верно' : 'Неверно',
    options: ['Верно', 'Неверно'],
    explanation: isTrue ? `Всё верно: ${eq}.` : `Неверно: ${eq}, а не ${fmt(shown)}.`,
  }
}

// ───────── «Кратные» ─────────

function genDivisible(level: Level): Core {
  const divisors = level === 1 ? [3, 4, 5, 6, 7, 8, 9] : level === 2 ? [6, 7, 8, 9, 11, 12] : [7, 8, 9, 11, 12, 13]
  const lo = level === 1 ? 20 : 50
  const hi = level === 1 ? 200 : 900
  let d = 3
  let c = 0
  for (let i = 0; i < 25; i++) {
    d = pickOne(divisors)
    c = d * rand(Math.ceil(lo / d), Math.floor(hi / d))
    if (fresh(`dv${d}:${c}`)) break
  }
  const wrongs: number[] = []
  let guard = 0
  while (wrongs.length < 3 && guard++ < 200) {
    // берём другое кратное и сдвигаем на пару единиц — выглядит правдоподобно
    const m = d * rand(Math.ceil(lo / d), Math.floor(hi / d))
    const off = rand(1, d - 1) * (Math.random() < 0.5 ? 1 : -1)
    const v = m + off
    if (v >= lo && v <= hi && v % d !== 0 && !wrongs.includes(v) && v !== c) wrongs.push(v)
  }
  const options = shuffle([String(c), ...wrongs.map(String)])
  return {
    question: `Какое число делится на ${d}?`,
    correct: String(c),
    options,
    explanation: `${c} = ${d} × ${c / d}, поэтому число делится на ${d} без остатка. Остальные дают остаток.`,
  }
}

// ───────── «Что больше?» ─────────

type Ex = { text: string; v: number; isNum: boolean }
type Op = 'mul' | 'add' | 'sub' | 'sq'

// Диапазоны операндов: mul — [a от, a до, b от, b до], add/sub — так же, sq — [n от, n до]
const SPEC: Record<Level, { mul: number[]; add: number[]; sub: number[]; sq: number[]; ops: Op[] }> = {
  1: { mul: [3, 9, 3, 9], add: [12, 60, 12, 60], sub: [40, 99, 11, 39], sq: [3, 9], ops: ['mul', 'mul', 'add', 'add', 'sub'] },
  2: { mul: [11, 19, 3, 9], add: [120, 700, 21, 99], sub: [200, 900, 21, 99], sq: [11, 16], ops: ['mul', 'mul', 'add', 'sub', 'sq'] },
  3: { mul: [12, 29, 11, 25], add: [150, 800, 120, 700], sub: [500, 990, 110, 480], sq: [13, 30], ops: ['mul', 'mul', 'add', 'sub', 'sq'] },
}

const inR = (x: number, lo: number, hi: number) => x >= lo && x <= hi

function build(op: Op, a: number, b: number): Ex {
  if (op === 'mul') return { text: `${a} × ${b}`, v: a * b, isNum: false }
  if (op === 'add') return { text: `${a} + ${b}`, v: a + b, isNum: false }
  if (op === 'sub') return { text: `${a} ${MINUS} ${b}`, v: a - b, isNum: false }
  return { text: `${a}²`, v: a * a, isNum: false }
}

function exprOf(level: Level): Ex {
  const sp = SPEC[level]
  const op = pickOne(sp.ops)
  if (op === 'sq') return build('sq', rand(sp.sq[0], sp.sq[1]), 0)
  const r = sp[op]
  return build(op, rand(r[0], r[1]), rand(r[2], r[3]))
}

// Выражение, значение которого отличается от v на 1..maxDiff (или null, если не нашлось)
function exprNear(level: Level, v: number, maxDiff: number): Ex | null {
  const sp = SPEC[level]
  for (let i = 0; i < 40; i++) {
    const op = pickOne(sp.ops)
    const target = v + rand(1, maxDiff) * (Math.random() < 0.5 ? 1 : -1)
    let e: Ex | null = null
    if (op === 'add') {
      const b = rand(sp.add[2], sp.add[3]); const a = target - b
      if (inR(a, sp.add[0], sp.add[1])) e = build('add', a, b)
    } else if (op === 'sub') {
      const b = rand(sp.sub[2], sp.sub[3]); const a = target + b
      if (inR(a, sp.sub[0], sp.sub[1])) e = build('sub', a, b)
    } else if (op === 'mul') {
      const a = rand(sp.mul[0], sp.mul[1]); const b = Math.round(target / a)
      if (inR(b, sp.mul[2], sp.mul[3])) e = build('mul', a, b)
    } else {
      const n = Math.round(Math.sqrt(target))
      if (inR(n, sp.sq[0], sp.sq[1])) e = build('sq', n, 0)
    }
    if (e && e.v > 0 && Math.abs(e.v - v) >= 1 && Math.abs(e.v - v) <= maxDiff) return e
  }
  return null
}

function genBigger(level: Level): Core {
  let L: Ex = { text: '1', v: 1, isNum: true }
  let R: Ex = { text: '2', v: 2, isNum: true }
  const maxDiff = byLevel(level, 8, 10, 15)
  for (let i = 0; i < 30; i++) {
    const e1 = exprOf(level)
    if (e1.v <= maxDiff) continue
    let e2: Ex | null = null
    if (level === 1 || Math.random() < 0.3) e2 = exprNear(level, e1.v, maxDiff)
    if (!e2) {
      const delta = rand(1, maxDiff) * (Math.random() < 0.5 ? 1 : -1)
      if (level === 1) continue // на первом уровне всегда два выражения
      e2 = { text: fmt(e1.v + delta), v: e1.v + delta, isNum: true }
    }
    if (e2.v <= 0 || e1.v === e2.v || e1.text === e2.text) continue
    if (!fresh(`bg${e1.text}|${e2.text}`)) continue
    ;[L, R] = Math.random() < 0.5 ? [e1, e2] : [e2, e1]
    break
  }
  if (L.v === R.v) { // запасной путь: почти недостижим
    L = { text: '12 × 7', v: 84, isNum: false }
    R = { text: '9 × 9', v: 81, isNum: false }
  }
  const desc = (e: Ex) => (e.isNum ? fmt(e.v) : `${e.text} = ${fmt(e.v)}`)
  const left = L.v > R.v
  return {
    chip: 'Какое значение больше?',
    question: `${L.text} или ${R.text}?`,
    correct: left ? 'Левое' : 'Правое',
    options: ['Левое', 'Правое'],
    explanation: `Слева ${desc(L)}, справа ${desc(R)}. ${left ? 'Левое' : 'Правое'} больше.`,
  }
}

// ───────── Выбор вида и сборка ─────────

type Weighted = { kind: string; w: number }
const WEIGHTS: Weighted[] = [
  { kind: 'mul', w: 22 }, { kind: 'addsub', w: 16 }, { kind: 'div', w: 12 }, { kind: 'square', w: 12 },
  { kind: 'truefalse', w: 16 }, { kind: 'divisible', w: 10 }, { kind: 'bigger', w: 12 },
]

let lastKind = ''

function pickKind(): string {
  const options = WEIGHTS.filter((o) => o.kind !== lastKind)
  const sum = options.reduce((a, o) => a + o.w, 0)
  let r = Math.random() * sum
  for (const o of options) {
    r -= o.w
    if (r <= 0) return o.kind
  }
  return options[0].kind
}

const TIME: Record<string, [number, number, number]> = {
  mul: [8, 6, 7],
  addsub: [8, 6, 5],
  div: [8, 6, 5],
  square: [8, 6, 5],
  truefalse: [4, 3.5, 3],
  divisible: [8, 6, 5],
  bigger: [4, 3.5, 3],
}

export function generateSpeed(level: Level): GameTask {
  const kind = pickKind()
  lastKind = kind
  const core =
    kind === 'mul' ? genMul(level)
    : kind === 'addsub' ? genAddSub(level)
    : kind === 'div' ? genDiv(level)
    : kind === 'square' ? genSquare(level)
    : kind === 'truefalse' ? genTrueFalse(level)
    : kind === 'divisible' ? genDivisible(level)
    : genBigger(level)
  const [t1, t2, t3] = TIME[kind]
  const timeLimit = byLevel(level, t1, t2, t3)
  const task: GameTask = {
    topic: 'speed',
    kind,
    kindLabel: SPEED_KINDS[kind],
    level,
    layout: 'choice',
    question: core.question,
    options: core.options,
    correct: core.correct,
    explanation: core.explanation,
    xp: XP_BY_LEVEL[level],
    fastSeconds: Math.round(timeLimit * 0.4 * 10) / 10,
    timeLimit,
  }
  if (core.chip) task.chip = core.chip
  return task
}
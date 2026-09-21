// Игра «Цвета» (эффект Струпа): слово и цвет букв спорят друг с другом.
// Три вида: «Цвет или слово», «Совпадает?» и «Посчитай цвет».

import { rand, pickOne, shuffle, numberOptions, makeRecent } from './gamekit'
import { XP_BY_LEVEL } from './gametypes'
import type { Cell, GameTask, Level } from './gametypes'

export const COLORS_KINDS: Record<string, string> = {
  stroop: 'Цвет или слово',
  match: 'Совпадает?',
  count: 'Посчитай цвет',
}

export type StroopColor = { id: string; name: string; hex: string }

// Первые четыре — для уровней 1 и 2, все шесть — для уровня 3
export const STROOP_COLORS: StroopColor[] = [
  { id: 'red', name: 'Красный', hex: '#EF4444' },
  { id: 'blue', name: 'Синий', hex: '#3B82F6' },
  { id: 'green', name: 'Зелёный', hex: '#22C55E' },
  { id: 'yellow', name: 'Жёлтый', hex: '#EAB308' },
  { id: 'orange', name: 'Оранжевый', hex: '#F97316' },
  { id: 'purple', name: 'Фиолетовый', hex: '#A855F7' },
]

// Падежные формы для вопросов и пояснений
const FORMS: Record<string, { instr: string; gen: string }> = {
  red: { instr: 'красным', gen: 'красного' },
  blue: { instr: 'синим', gen: 'синего' },
  green: { instr: 'зелёным', gen: 'зелёного' },
  yellow: { instr: 'жёлтым', gen: 'жёлтого' },
  orange: { instr: 'оранжевым', gen: 'оранжевого' },
  purple: { instr: 'фиолетовым', gen: 'фиолетового' },
}

const low = (c: StroopColor) => c.name.toLowerCase()
const up = (c: StroopColor) => c.name.toUpperCase()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const paletteFor = (level: Level): StroopColor[] => (level === 3 ? STROOP_COLORS : STROOP_COLORS.slice(0, 4))

const recent = makeRecent(6)
const round1 = (x: number) => Math.round(x * 10) / 10

// ───────── «Цвет или слово» ─────────

function genStroop(level: Level): GameTask {
  const pool = paletteFor(level)
  const congruent = level === 3 && Math.random() < 0.15
  const rule: 'ink' | 'word' = level === 1 ? 'ink' : Math.random() < 0.5 ? 'ink' : 'word'
  let word = pool[0]
  let ink = pool[1]
  for (let i = 0; i < 20; i++) {
    word = pickOne(pool)
    ink = congruent ? word : pickOne(pool.filter((c) => c.id !== word.id))
    const key = `s${word.id}${ink.id}${rule}`
    if (!recent.has(key)) { recent.add(key); break }
  }
  const answer = rule === 'ink' ? ink : word
  let chosen: StroopColor[]
  if (pool.length === 4) {
    chosen = pool
  } else {
    const must = [...new Set([answer.id, word.id, ink.id])]
    const rest = shuffle(pool.filter((c) => !must.includes(c.id)))
    chosen = [...pool.filter((c) => must.includes(c.id)), ...rest].slice(0, 4)
  }
  let explanation: string
  if (congruent) explanation = `Слово и цвет букв совпали: ${low(word)}.`
  else if (rule === 'ink') explanation = `Написано «${up(word)}», а цвет букв — ${low(ink)}. Нужно назвать цвет букв: ${low(ink)}.`
  else explanation = `Цвет букв — ${low(ink)}, а написано «${up(word)}». Нужно назвать то, что написано: ${low(word)}.`
  return {
    topic: 'colors',
    kind: 'stroop',
    kindLabel: COLORS_KINDS.stroop,
    level,
    layout: 'choice',
    chip: rule === 'ink' ? 'Выбери цвет БУКВ' : 'Выбери, что НАПИСАНО',
    question: up(word),
    questionColor: ink.hex,
    options: shuffle(chosen.map((c) => c.name)),
    correct: answer.name,
    explanation,
    xp: XP_BY_LEVEL[level],
    fastSeconds: level === 1 ? 2.5 : level === 2 ? 2 : 1.7,
    timeLimit: level === 1 ? 8 : level === 2 ? 6 : 5,
  }
}

// ───────── «Совпадает?» ─────────

function genMatch(level: Level): GameTask {
  const pool = paletteFor(level)
  const isMatch = Math.random() < 0.45
  let word = pool[0]
  let ink = pool[0]
  for (let i = 0; i < 20; i++) {
    word = pickOne(pool)
    ink = isMatch ? word : pickOne(pool.filter((c) => c.id !== word.id))
    const key = `m${word.id}${ink.id}`
    if (!recent.has(key)) { recent.add(key); break }
  }
  return {
    topic: 'colors',
    kind: 'match',
    kindLabel: COLORS_KINDS.match,
    level,
    layout: 'choice',
    chip: 'Цвет букв совпадает со словом?',
    question: up(word),
    questionColor: ink.hex,
    options: ['Да', 'Нет'],
    correct: isMatch ? 'Да' : 'Нет',
    explanation: isMatch
      ? `Написано «${up(word)}», и цвет букв тоже ${low(ink)}: совпадает.`
      : `Написано «${up(word)}», а цвет букв — ${low(ink)}: не совпадает.`,
    xp: XP_BY_LEVEL[level],
    fastSeconds: level === 1 ? 1.5 : level === 2 ? 1.4 : 1.2,
    timeLimit: level === 1 ? 4 : level === 2 ? 3.5 : 3,
  }
}

// ───────── «Посчитай цвет» ─────────

function genCount(level: Level): GameTask {
  const pool = paletteFor(level)
  const total = level === 1 ? 12 : level === 2 ? 16 : 20
  const cols = level === 3 ? 5 : 4
  const words = STROOP_COLORS.slice(0, 4) // слова в клетках — короткие, чтобы влезали
  let target = pool[0]
  for (let i = 0; i < 20; i++) {
    target = pickOne(pool)
    if (!recent.has(`c${target.id}`)) { recent.add(`c${target.id}`); break }
  }
  const t = level === 1 ? rand(2, 5) : level === 2 ? rand(3, 6) : rand(3, 7)
  const others = pool.filter((c) => c.id !== target.id)
  const inks: StroopColor[] = []
  for (let i = 0; i < t; i++) inks.push(target)
  for (let i = t; i < total; i++) inks.push(pickOne(others))
  const order = shuffle(inks)
  const cells: Cell[] = order.map((ink) => ({
    text: level === 1 ? '■' : up(pickOne(words.filter((w) => w.id !== ink.id))),
    color: ink.hex,
  }))
  if (level > 1 && words.some((w) => w.id === target.id)) {
    // Ловушка: хотя бы одно слово называет целевой цвет, но написано другим
    const idx = order.map((c, i) => (c.id !== target.id ? i : -1)).filter((i) => i >= 0)
    if (idx.length > 0) cells[pickOne(idx)].text = up(target)
  }
  const f = FORMS[target.id]
  const question = level === 1
    ? `Сколько квадратиков ${f.gen.toUpperCase()} цвета?`
    : `Сколько слов написано ${f.instr.toUpperCase()}?`
  const explanation = level === 1
    ? `Квадратиков ${f.gen} цвета — ${t}.`
    : `${cap(f.instr)} написано ${t} ${plural(t, 'слово', 'слова', 'слов')}. Считать нужно по цвету букв, а не по смыслу слов.`
  const timeLimit = level === 1 ? 10 : level === 2 ? 12 : 14
  return {
    topic: 'colors',
    kind: 'count',
    kindLabel: COLORS_KINDS.count,
    level,
    layout: 'choice',
    chip: level === 1 ? 'Считай по цвету' : 'Смотри на цвет БУКВ, а не на слово',
    question,
    questionColor: target.hex,
    stimulus: { type: 'cells', cells, cols, size: level === 1 ? 'lg' : level === 2 ? 'md' : 'sm' },
    options: numberOptions(t, [t + 1, t - 1, t + 2, t - 2], 2),
    correct: String(t),
    explanation,
    xp: XP_BY_LEVEL[level],
    fastSeconds: round1(timeLimit * 0.45),
    timeLimit,
  }
}

// ───────── Выбор вида ─────────

const WEIGHTS: { kind: string; w: number }[] = [
  { kind: 'stroop', w: 55 }, { kind: 'match', w: 25 }, { kind: 'count', w: 20 },
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

export function generateColors(level: Level): GameTask {
  const kind = pickKind()
  lastKind = kind
  if (kind === 'stroop') return genStroop(level)
  if (kind === 'match') return genMatch(level)
  return genCount(level)
}
// Игра «Внимание»: генератор заданий (topic 'attention').
// Шесть видов: найди лишнего, посчитай, таблица Шульте, кого больше, чего не хватает, найди слово.
// Всё создаётся на лету, без сети; на один вызов уходит доли миллисекунды.

import type { Cell, GameTask, Level } from './gametypes'
import { XP_BY_LEVEL } from './gametypes'
import { makeRecent, numberOptions, pickN, pickOne, rand, shuffle, uniqueOptions } from './gamekit'

export const ATTENTION_KINDS: Record<string, string> = {
  odd: 'Найди лишнего',
  count: 'Посчитай',
  schulte: 'Таблица Шульте',
  most: 'Кого больше',
  missing: 'Чего не хватает',
  find: 'Найди слово',
}

// ───────── Банки ─────────

// Пары «двойников» по сложности: 1 — легко отличить (цвет/форма), 2 — средне, 3 — трудно.
// Только обычные одиночные эмодзи, которые одинаково рисуются на телефонах.
const LOOKALIKES: { a: string; b: string; tier: 1 | 2 | 3 }[] = [
  { a: '🍎', b: '🍏', tier: 1 }, { a: '🔴', b: '🟠', tier: 1 }, { a: '💙', b: '💚', tier: 1 }, { a: '📕', b: '📗', tier: 1 },
  { a: '🚗', b: '🚕', tier: 1 }, { a: '🌹', b: '🌷', tier: 1 }, { a: '🍅', b: '🍎', tier: 1 }, { a: '🔺', b: '🔻', tier: 1 },
  { a: '🔒', b: '🔓', tier: 1 }, { a: '🔔', b: '🔕', tier: 1 }, { a: '🍊', b: '🍋', tier: 1 }, { a: '🌲', b: '🌴', tier: 1 },

  { a: '🔵', b: '🟣', tier: 2 }, { a: '😀', b: '😃', tier: 2 }, { a: '⭐', b: '🌟', tier: 2 }, { a: '🐱', b: '🐈', tier: 2 },
  { a: '🐶', b: '🐕', tier: 2 }, { a: '🐰', b: '🐇', tier: 2 }, { a: '🐳', b: '🐋', tier: 2 }, { a: '🌞', b: '🌝', tier: 2 },
  { a: '🌛', b: '🌜', tier: 2 }, { a: '💙', b: '💜', tier: 2 }, { a: '🐻', b: '🐼', tier: 2 }, { a: '🍓', b: '🍒', tier: 2 },
  { a: '🌳', b: '🌲', tier: 2 }, { a: '😊', b: '🙂', tier: 2 }, { a: '🙂', b: '🙃', tier: 2 }, { a: '😡', b: '😠', tier: 2 },
  { a: '😢', b: '😭', tier: 2 }, { a: '🚌', b: '🚎', tier: 2 }, { a: '🚓', b: '🚔', tier: 2 },

  { a: '🕐', b: '🕑', tier: 3 }, { a: '🕒', b: '🕓', tier: 3 }, { a: '🕔', b: '🕕', tier: 3 }, { a: '🌕', b: '🌖', tier: 3 },
  { a: '🌗', b: '🌘', tier: 3 }, { a: '🙈', b: '🙉', tier: 3 }, { a: '🙉', b: '🙊', tier: 3 }, { a: '🐤', b: '🐥', tier: 3 },
  { a: '😄', b: '😁', tier: 3 }, { a: '🌑', b: '🌒', tier: 3 }, { a: '🐓', b: '🐔', tier: 3 }, { a: '🐠', b: '🐟', tier: 3 },
  { a: '🐬', b: '🐳', tier: 3 }, { a: '⏫', b: '⏬', tier: 3 },
]

// Значки для «Посчитай» и «Кого больше»: заметно разные, без двойников
const SYMBOLS: string[] = [
  '🍎', '🍌', '🍇', '🍋', '🥕', '🍄', '🐶', '🐱', '🐸', '🐟', '🦋', '🐝', '⭐', '🌙', '🚗', '🎈', '🔑', '🔔', '🎁', '🍩',
  '🌻', '🐢', '🎲', '⚽',
]

// Слова-«двойники»: в каждой группе слова похожи по написанию, но все настоящие и разные.
// Слова во всех группах вместе не повторяются.
const WORD_GROUPS: string[][] = [
  ['дом', 'дым', 'лом', 'ком', 'том'],
  ['кот', 'код', 'кит', 'ток'],
  ['стол', 'стул', 'стон', 'столб'],
  ['мост', 'пост', 'рост', 'хвост'],
  ['лес', 'лис', 'лев', 'лён'],
  ['мак', 'рак', 'бак', 'лак'],
  ['мир', 'пир', 'тир', 'сыр'],
  ['лук', 'люк', 'луг'],
  ['коса', 'коза', 'кожа', 'роса'],
  ['бочка', 'почка', 'точка', 'кочка', 'дочка'],
  ['мишка', 'мышка', 'кишка', 'шишка', 'миска'],
  ['пруд', 'прут', 'труд', 'друг', 'круг'],
  ['рука', 'река', 'мука', 'руда'],
  ['жук', 'жар', 'жир', 'шар'],
  ['банка', 'балка', 'палка', 'полка', 'галка'],
  ['ворона', 'корона', 'ворота'],
  ['гора', 'нора', 'кора', 'жара'],
  ['шапка', 'шашка', 'шайба', 'шайка'],
  ['игла', 'игра', 'икра', 'искра'],
  ['чай', 'чан', 'час', 'чад'],
  ['сон', 'сок', 'сом', 'сор'],
]

// ───────── Помощники ─────────

const recentPairs = makeRecent(8)
const recentFind = makeRecent(14)

const base = (level: Level, kind: string) => ({
  topic: 'attention' as const,
  kind,
  kindLabel: ATTENTION_KINDS[kind],
  level,
  xp: XP_BY_LEVEL[level],
})

const LEVELS = <T,>(a: T, b: T, c: T): Record<Level, T> => ({ 1: a, 2: b, 3: c })

// Раскладывает total штук по k группам: у каждой не меньше min и не больше cap
function compose(total: number, k: number, min: number, cap: number): number[] {
  const out = Array.from({ length: k }, () => min)
  let left = total - min * k
  let guard = 0
  while (left > 0 && guard++ < 5000) {
    const i = rand(0, k - 1)
    if (out[i] < cap) { out[i]++; left-- }
  }
  if (left > 0) throw new Error('compose: impossible')
  return out
}

const cellsOf = (items: string[]): Cell[] => items.map((text) => ({ text }))

// ───────── 1. Найди лишнего ─────────

function genOdd(level: Level): GameTask {
  const cols = LEVELS(4, 5, 6)[level]
  const total = cols * cols
  const tiers: (1 | 2 | 3)[] = level === 1 ? [1] : level === 2 ? [2] : [2, 3]
  const pool = LOOKALIKES.filter((p) => tiers.includes(p.tier))
  const fresh = pool.filter((p) => !recentPairs.has(p.a + p.b))
  const pair = pickOne(fresh.length ? fresh : pool)
  recentPairs.add(pair.a + pair.b)

  const flip = Math.random() < 0.5
  const maj = flip ? pair.a : pair.b
  const odd = flip ? pair.b : pair.a
  const idx = rand(0, total - 1)
  const items = Array.from({ length: total }, (_, i) => (i === idx ? odd : maj))

  return {
    ...base(level, 'odd'),
    layout: 'tap',
    intro: 'Один значок чуть-чуть не такой, как остальные',
    question: 'Найди отличающийся значок',
    options: [],
    correct: String(idx),
    explanation: `Все значки были ${maj}, кроме одного — ${odd} (строка ${Math.floor(idx / cols) + 1}, столбец ${(idx % cols) + 1}). Смотри на весь ряд сразу, а не на каждый значок.`,
    xp: XP_BY_LEVEL[level],
    fastSeconds: LEVELS(4, 5, 6)[level],
    timeLimit: LEVELS(15, 13, 11)[level],
    tap: { cells: cellsOf(items), cols },
  }
}

// ───────── 2. Посчитай ─────────

function genCount(level: Level): GameTask {
  const total = LEVELS(15, 20, 25)[level]
  const kinds = LEVELS(3, 4, 5)[level]
  const [minC, maxC] = level === 1 ? [3, 8] : level === 2 ? [3, 9] : [4, 11]
  const icons = pickN(SYMBOLS, kinds)
  const c = rand(minC, maxC)
  // цель — первый значок; у остальных не меньше одного значка
  const rest = compose(total - c, kinds - 1, 1, total)
  const counts = [c, ...rest]
  const items = shuffle(icons.flatMap((e, i) => Array.from({ length: counts[i] }, () => e)))
  const targetIdx = 0
  const target = icons[targetIdx]

  const options = numberOptions(c, [c - 1, c + 1, c - 2, c + 2], 3)
  const summary = shuffle(icons.map((e, i) => `${e} — ${counts[i]}`)).join(', ')

  return {
    ...base(level, 'count'),
    layout: 'choice',
    intro: 'Считай внимательно, не торопись',
    stimulus: { type: 'cells', cells: cellsOf(items), cols: 5, size: 'md' },
    question: `Сколько раз встречается ${target}?`,
    options, correct: String(c),
    explanation: `В сетке: ${summary}. Считай ряд за рядом — так проще не сбиться.`,
    xp: XP_BY_LEVEL[level],
    fastSeconds: LEVELS(6, 7, 8)[level],
    timeLimit: LEVELS(12, 14, 16)[level],
  }
}

// ───────── 3. Таблица Шульте ─────────

function genSchulte(level: Level): GameTask {
  const cols = LEVELS(3, 4, 5)[level]
  const n = cols * cols
  const sorted = Array.from({ length: n }, (_, i) => i + 1)
  let numbers = sorted
  for (let g = 0; g < 200; g++) {
    numbers = shuffle(sorted)
    const fixed = numbers.filter((v, i) => v === i + 1).length
    if (fixed <= 1) break
  }
  if (numbers.every((v, i) => v === i + 1)) numbers = [...sorted.slice(1), sorted[0]]   // страховка: не по порядку

  return {
    ...base(level, 'schulte'),
    xp: XP_BY_LEVEL[level] + 5,
    layout: 'schulte',
    intro: 'Смотри в центр таблицы и ищи числа боковым зрением',
    question: `Тапай числа по порядку от 1 до ${n}`,
    options: [],
    correct: 'ok',
    explanation: 'Не води глазами по всей таблице: держи взгляд в центре и ловь следующее число боковым зрением — так внимание растёт быстрее.',
    fastSeconds: LEVELS(7, 16, 30)[level],
    timeLimit: LEVELS(15, 30, 55)[level],
    schulte: { numbers, cols },
  }
}

// ───────── 4. Кого больше ─────────

function genMost(level: Level): GameTask {
  const total = LEVELS(16, 20, 25)[level]
  const kinds = level === 1 ? 3 : level === 2 ? (Math.random() < 0.5 ? 3 : 4) : 4
  const margin = level === 1 ? 3 : 2
  const icons = pickN(SYMBOLS, kinds)

  // победитель w: остальные (k-1 групп по ≥2) должны уместиться в w - margin
  const minW = Math.ceil((total + (kinds - 1) * margin) / kinds)
  const maxW = Math.min(minW + 3, total - 2 * (kinds - 1))
  const w = rand(minW, maxW)
  const others = compose(total - w, kinds - 1, 2, w - margin)
  const counts = [w, ...others]
  const items = shuffle(icons.flatMap((e, i) => Array.from({ length: counts[i] }, () => e)))

  const summary = icons.map((e, i) => `${e} — ${counts[i]}`).join(', ')
  return {
    ...base(level, 'most'),
    layout: 'choice',
    intro: 'Оцени на глаз или посчитай — как тебе удобнее',
    stimulus: { type: 'cells', cells: cellsOf(items), cols: 5, size: 'md' },
    question: 'Каких значков больше всего?',
    options: shuffle([...icons]),
    correct: icons[0],
    explanation: `Больше всех было ${icons[0]}. Счёт: ${shuffle(summary.split(', ')).join(', ')}.`,
    xp: XP_BY_LEVEL[level],
    fastSeconds: 5,
    timeLimit: LEVELS(10, 10, 9)[level],
  }
}

// ───────── 5. Чего не хватает ─────────

function genMissing(level: Level): GameTask {
  const n = LEVELS(15, 20, 25)[level]
  const all = Array.from({ length: n }, (_, i) => i + 1)
  const m = rand(1, n)
  const present = all.filter((x) => x !== m)
  const items = shuffle(present).map(String)
  const options = uniqueOptions(String(m), shuffle(present).slice(0, 8).map(String), 4)
    .sort((x, y) => Number(x) - Number(y))

  return {
    ...base(level, 'missing'),
    layout: 'choice',
    intro: `В сетке числа от 1 до ${n}, но одного не хватает`,
    stimulus: { type: 'cells', cells: cellsOf(items), cols: 5, size: 'md' },
    question: 'Какого числа не хватает?',
    options, correct: String(m),
    explanation: `Не хватало числа ${m}. Удобно проверять по порядку: сначала 1–10, потом дальше.`,
    xp: XP_BY_LEVEL[level],
    fastSeconds: LEVELS(8, 10, 12)[level],
    timeLimit: LEVELS(15, 18, 20)[level],
  }
}

// ───────── 6. Найди слово ─────────

function genFind(level: Level): GameTask {
  const total = LEVELS(12, 16, 20)[level]
  const cols = LEVELS(3, 4, 4)[level]

  const groups = WORD_GROUPS.filter((g) => g.length >= 3)
  const freshTargets = groups.flatMap((g) => g.map((w) => ({ g, w }))).filter((x) => !recentFind.has(x.w))
  const { g: group, w: target } = pickOne(freshTargets)
  recentFind.add(target)

  const mates = shuffle(group.filter((w) => w !== target))
  const otherGroups = shuffle(WORD_GROUPS.filter((g) => g !== group))
  const need = total - 1
  let fillers: string[]
  if (level === 1) {
    // лёгкий уровень: чужие слова, ни одного двойника
    fillers = pickN(otherGroups.flat(), need)
  } else if (level === 2) {
    // один-два двойника, остальные разные
    const takeMates = mates.slice(0, rand(1, 2))
    fillers = [...takeMates, ...pickN(otherGroups.flat(), need - takeMates.length)]
  } else {
    // трудный уровень: все двойники цели и «стайки» двойников из других групп
    fillers = [...mates]
    for (const g of otherGroups) {
      if (fillers.length >= need) break
      fillers.push(...shuffle(g).slice(0, Math.min(3, need - fillers.length)))
    }
  }
  const words = shuffle([target, ...fillers])
  const idx = words.indexOf(target)
  const lookalikes = words.filter((w) => w !== target && group.includes(w))

  const trap = level > 1 && lookalikes.length > 0 ? ` Похожие слова (${lookalikes.join(', ')}) — это ловушки.` : ''
  return {
    ...base(level, 'find'),
    layout: 'tap',
    intro: 'Ищи глазами, не читай всё подряд',
    question: `Найди слово «${target}»`,
    options: [],
    correct: String(idx),
    explanation: `Слово «${target}» стояло в строке ${Math.floor(idx / cols) + 1}, столбце ${(idx % cols) + 1}.${trap}`,
    xp: XP_BY_LEVEL[level],
    fastSeconds: 6,
    timeLimit: LEVELS(14, 12, 12)[level],
    tap: { cells: cellsOf(words), cols },
  }
}

// ───────── Выбор вида ─────────

const WEIGHTS: { kind: string; w: number }[] = [
  { kind: 'odd', w: 22 },
  { kind: 'count', w: 18 },
  { kind: 'schulte', w: 12 },
  { kind: 'most', w: 16 },
  { kind: 'missing', w: 14 },
  { kind: 'find', w: 18 },
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

export function generateAttention(level: Level): GameTask {
  const kind = pickKind()
  lastKind = kind
  switch (kind) {
    case 'odd': return genOdd(level)
    case 'count': return genCount(level)
    case 'schulte': return genSchulte(level)
    case 'most': return genMost(level)
    case 'missing': return genMissing(level)
    default: return genFind(level)
  }
}
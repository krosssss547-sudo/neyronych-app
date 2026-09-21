// Игра «Память»: генератор заданий (topic 'memory').
// Шесть видов: список слов, числа, пары «картинка — число», картинки в клетках,
// порядок цветных кружков и «Саймон» (блоки Корси). Всё создаётся на лету, без сети.

import type { Cell, GameTask, Level } from './gametypes'
import { XP_BY_LEVEL } from './gametypes'
import { makeRecent, pickN, pickOne, rand, shuffle, uniqueOptions } from './gamekit'

export const MEMORY_KINDS: Record<string, string> = {
  words: 'Список слов',
  digits: 'Числа',
  pairs: 'Пары',
  gridrecall: 'Картинки в клетках',
  order: 'Порядок',
  corsi: 'Повтори порядок',
}

// ───────── Банки ─────────

// Конкретные существительные в им. п. ед. ч. В банке нет синонимов и «родственных» пар
// (кот/кошка, лодка/корабль, стул/скамейка…), поэтому любой набор слов из него однозначен.
const WORDS: string[] = [
  // еда
  'яблоко', 'груша', 'хлеб', 'сыр', 'арбуз', 'морковь', 'огурец', 'лимон', 'пирог', 'конфета', 'картошка', 'банан',
  'мёд', 'орех', 'гриб', 'чеснок', 'помидор', 'слива', 'сахар', 'суп', 'виноград', 'ананас', 'мороженое',
  // животные
  'слон', 'жираф', 'лиса', 'волк', 'медведь', 'заяц', 'ёж', 'белка', 'кот', 'пингвин', 'орёл', 'сова', 'лягушка',
  'черепаха', 'крокодил', 'бабочка', 'паук', 'дельфин', 'верблюд', 'корова', 'курица', 'тигр', 'мышь',
  // предметы
  'ключ', 'лампа', 'зонт', 'чашка', 'ложка', 'вилка', 'тарелка', 'нож', 'будильник', 'зеркало', 'расчёска', 'мыло',
  'полотенце', 'подушка', 'свеча', 'молоток', 'лопата', 'топор', 'гвоздь', 'игла', 'нитка', 'пуговица', 'кошелёк',
  'рюкзак', 'чемодан', 'календарь', 'компас', 'телефон', 'гитара', 'барабан', 'скрипка', 'флаг', 'шкаф', 'диван',
  'окно', 'дверь', 'лестница', 'кровать', 'холодильник', 'глобус', 'монета', 'ведро', 'корзина', 'конверт', 'якорь',
  // транспорт
  'поезд', 'самолёт', 'велосипед', 'трактор', 'автобус', 'лодка', 'ракета',
  // природа
  'облако', 'дождь', 'снег', 'радуга', 'озеро', 'остров', 'пещера', 'вулкан', 'пустыня', 'водопад', 'луна', 'звезда',
  'туман', 'молния', 'песок', 'камень', 'трава', 'ромашка', 'тюльпан', 'дуб', 'ёлка', 'берёза', 'кактус',
  // места и постройки
  'мост', 'замок', 'маяк', 'школа', 'больница', 'рынок', 'вокзал', 'театр', 'музей', 'пирамида', 'фонтан', 'забор',
  // одежда
  'шапка', 'шарф', 'перчатка', 'носок', 'куртка', 'ботинок', 'галстук', 'футболка', 'юбка',
  // герои и профессии
  'повар', 'врач', 'художник', 'пират', 'космонавт', 'клоун', 'дракон', 'робот',
]

// Обычные эмодзи (один символ, без ZWJ и оттенков кожи). Без «двойников» вроде 🍎/🍏.
const EMOJI: string[] = [
  '🍎', '🍌', '🍇', '🍓', '🍒', '🍑', '🍋', '🍉', '🍍', '🥕', '🌽', '🍄', '🍔', '🍕', '🍩', '🍪',
  '🌵', '🌻', '🌹', '🍀', '🌈', '🔥', '💧', '⭐', '🌙',
  '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐸', '🐵', '🐔', '🐧', '🐢', '🐟', '🐙', '🦋', '🐝', '🐞', '🐘', '🦁', '🐷',
  '🚗', '🚌', '🚂', '🚀', '🚲', '⚽', '🏀', '🎈', '🎁', '🎲', '🎸', '🔑', '🔔', '💡', '📖', '⏰', '🎩', '👑', '🎧', '⚓',
]

const CIRCLES = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪']

// ───────── Помощники ─────────

const recentWords = makeRecent(40)
const recentEmoji = makeRecent(28)
const recentDigits = makeRecent(12)

// Выбирает n элементов, стараясь брать «свежие» (которых не было недавно). Выбранные запоминает.
function pickFresh(bank: string[], n: number, recent: ReturnType<typeof makeRecent>): string[] {
  const fresh = bank.filter((x) => !recent.has(x))
  const pool = fresh.length >= n ? fresh : bank
  const out = pickN(pool, n)
  for (const x of out) recent.add(x)
  return out
}

const base = (level: Level, kind: string) => ({
  topic: 'memory' as const,
  kind,
  kindLabel: MEMORY_KINDS[kind],
  level,
  xp: XP_BY_LEVEL[level],
})

const LEVELS = <T,>(a: T, b: T, c: T): Record<Level, T> => ({ 1: a, 2: b, 3: c })

// Порядковые числительные в предложном падеже: «в 1-й строке», «во 2-м столбце»
const rowPhrase = (n: number) => `${n === 2 ? 'во' : 'в'} ${n}-й строке`
const colPhrase = (n: number) => `${n === 2 ? 'во' : 'в'} ${n}-м столбце`
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ───────── 1. Список слов ─────────

function genWords(level: Level): GameTask {
  const n = LEVELS(4, 6, 8)[level]
  const showMs = LEVELS(5000, 6500, 8000)[level]
  const list = pickFresh(WORDS, n, recentWords)
  const notIn = shuffle(WORDS.filter((w) => !list.includes(w)))

  const lines: string[] = []
  if (level === 1) {
    for (const w of list) lines.push(w)
  } else {
    for (let i = 0; i < list.length; i += 2) lines.push(list.slice(i, i + 2).join(' · '))
  }

  const askAbsent = Math.random() < 0.5
  let question: string
  let correct: string
  let options: string[]
  if (askAbsent) {
    question = 'Какого слова НЕ было в списке?'
    correct = notIn[0]
    options = uniqueOptions(correct, pickN(list, 3), 4)
  } else {
    question = 'Какое слово было в списке?'
    correct = pickOne(list)
    options = uniqueOptions(correct, notIn.slice(0, 6), 4)
  }
  const explanation = askAbsent
    ? `Слова «${correct}» в списке не было. Были: ${list.join(', ')}.`
    : `Слово «${correct}» было в списке. Весь список: ${list.join(', ')}.`

  return {
    ...base(level, 'words'),
    layout: 'memorize',
    intro: 'Запомни слова — порядок не важен',
    stimulus: { type: 'text', text: lines.join('\n'), size: level === 1 ? 'xl' : 'lg' },
    showMs,
    question, options, correct, explanation,
    fastSeconds: 5,
  }
}

// ───────── 2. Числа ─────────

const hasTriple = (d: number[]) => d.some((x, i) => i >= 2 && x === d[i - 1] && x === d[i - 2])
const isMonotone = (d: number[]) => d.every((x, i) => i === 0 || x === d[i - 1] + 1) || d.every((x, i) => i === 0 || x === d[i - 1] - 1)

function makeDigits(len: number, lastNonZero: boolean): string {
  for (let g = 0; g < 500; g++) {
    const d = Array.from({ length: len }, (_, i) => (i === 0 ? rand(1, 9) : rand(0, 9)))
    if (lastNonZero && d[len - 1] === 0) continue
    if (hasTriple(d) || isMonotone(d)) continue
    if (new Set(d).size < Math.min(4, len)) continue
    const s = d.join('')
    if (s === [...s].reverse().join('')) continue   // палиндром: «задом наперёд» совпало бы с исходным
    if (recentDigits.has(s)) continue
    return s
  }
  return lenSafe(len)
}

// Запасной вариант (практически недостижим): гарантированно корректное число
function lenSafe(len: number): string {
  const base = '4817295'
  return base.slice(0, len)
}

const validNumber = (s: string, len: number) => s.length === len && s[0] !== '0'

// Варианты-«ловушки» для числа: перестановка соседних цифр, замена одной цифры
function digitTraps(s: string): string[] {
  const swaps: string[] = []
  const changes: string[] = []
  const d = [...s]
  for (let i = 0; i < d.length - 1; i++) {
    if (d[i] === d[i + 1]) continue
    const t = [...d]; [t[i], t[i + 1]] = [t[i + 1], t[i]]
    swaps.push(t.join(''))
  }
  for (let i = 0; i < d.length; i++) {
    for (const delta of [-2, -1, 1, 2]) {
      const v = Number(d[i]) + delta
      if (v < 0 || v > 9) continue
      const t = [...d]; t[i] = String(v)
      changes.push(t.join(''))
    }
  }
  const ok = (x: string) => x !== s && validNumber(x, s.length)
  return [...shuffle(swaps.filter(ok)), ...shuffle(changes.filter(ok))]
}

function genDigits(level: Level): GameTask {
  const len = level === 1 ? 5 : 6
  const reversed = level === 3
  const shown = makeDigits(len, reversed)
  recentDigits.add(shown)
  const showMs = LEVELS(3000, 3500, 4000)[level]

  const answer = reversed ? [...shown].reverse().join('') : shown
  const traps = digitTraps(answer)
  const swaps = traps.filter((t) => [...t].filter((c, i) => c !== answer[i]).length === 2)
  const wrongs: string[] = []
  if (reversed) wrongs.push(shown)           // главный соблазн: число как есть
  for (const t of [swaps[0], ...traps]) {
    if (t !== undefined && !wrongs.includes(t)) wrongs.push(t)
    if (wrongs.length >= 3) break
  }
  const options = uniqueOptions(answer, wrongs, 4)

  return {
    ...base(level, 'digits'),
    layout: 'memorize',
    intro: reversed ? 'Запомни число — потом назови его задом наперёд' : 'Запомни число',
    stimulus: { type: 'text', text: shown, size: 'xl' },
    showMs,
    question: reversed ? 'Запиши число задом наперёд' : 'Какое число было на экране?',
    options, correct: answer,
    explanation: reversed
      ? `Было ${shown}. Читаем с конца: ${answer}. Удобно идти по цифрам справа налево.`
      : `Было число ${shown}. Разбей его на две части — так запоминать проще.`,
    fastSeconds: 6,
  }
}

// ───────── 3. Пары «картинка — число» ─────────

function genPairs(level: Level): GameTask {
  const n = LEVELS(3, 4, 5)[level]
  const showMs = LEVELS(5000, 6000, 7000)[level]
  const icons = pickFresh(EMOJI, n, recentEmoji)
  const nums = pickN([1, 2, 3, 4, 5, 6, 7, 8, 9], n)
  const askIdx = rand(0, n - 1)
  const correct = String(nums[askIdx])

  const others = nums.filter((_, i) => i !== askIdx).map(String)
  const unused = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => !nums.includes(x)).map(String)
  // сначала числа из соседних пар (сложнее), потом «чужие»
  const wrongs = [...shuffle(others), ...shuffle(unused)].slice(0, 3)
  const options = uniqueOptions(correct, wrongs, 4)

  return {
    ...base(level, 'pairs'),
    layout: 'memorize',
    intro: 'Запомни, какое число у какой картинки',
    stimulus: { type: 'text', text: icons.map((e, i) => `${e} — ${nums[i]}`).join('\n'), size: 'xl' },
    showMs,
    question: `Какое число было у ${icons[askIdx]}?`,
    options, correct,
    explanation: `У ${icons[askIdx]} было число ${correct}. Придумай для каждой пары маленькую историю — так запоминать легче.`,
    fastSeconds: 5,
  }
}

// ───────── 4. Картинки в клетках ─────────

const GRIDS: Record<Level, { cols: number; rows: number; n: number; showMs: number }> = {
  1: { cols: 3, rows: 3, n: 5, showMs: 4000 },
  2: { cols: 3, rows: 4, n: 7, showMs: 5000 },
  3: { cols: 4, rows: 4, n: 9, showMs: 6000 },
}

function genGridRecall(level: Level): GameTask {
  const { cols, rows, n, showMs } = GRIDS[level]
  const total = cols * rows
  const icons = pickFresh(EMOJI, n, recentEmoji)
  const spots = pickN(Array.from({ length: total }, (_, i) => i), n)
  const cells: Cell[] = Array.from({ length: total }, () => ({ text: '' }))
  spots.forEach((pos, i) => { cells[pos] = { text: icons[i] } })

  const askPos = pickOne(spots)
  const correct = cells[askPos].text
  const r = Math.floor(askPos / cols) + 1
  const c = (askPos % cols) + 1

  // внутренняя проверка: спрашиваем только про клетку с картинкой, все картинки разные
  if (!correct || new Set(icons).size !== icons.length) throw new Error('gridrecall: bad grid')

  const inGrid = icons.filter((e) => e !== correct)
  const notInGrid = EMOJI.filter((e) => !icons.includes(e))
  const wrongs = [...shuffle(inGrid).slice(0, 2), ...shuffle(notInGrid).slice(0, 1)]
  const options = uniqueOptions(correct, [...wrongs, ...shuffle(inGrid).slice(2), ...shuffle(notInGrid).slice(1)], 4)

  return {
    ...base(level, 'gridrecall'),
    layout: 'memorize',
    intro: 'Запомни, что где лежит',
    stimulus: { type: 'cells', cells, cols, size: level === 3 ? 'md' : 'lg' },
    showMs,
    question: `Что было ${rowPhrase(r)}, ${colPhrase(c)}?\n(строки считаем сверху вниз, столбцы — слева направо)`,
    options, correct,
    explanation: `${capFirst(rowPhrase(r))}, ${colPhrase(c)} была картинка ${correct}. Запоминай картинки рядами — слева направо и сверху вниз.`,
    fastSeconds: 6,
  }
}

// ───────── 5. Порядок цветных кружков ─────────

function genOrder(level: Level): GameTask {
  const n = LEVELS(4, 5, 6)[level]
  const showMs = LEVELS(3000, 3500, 4000)[level]
  const seq = pickN(CIRCLES, n)
  const unused = CIRCLES.filter((x) => !seq.includes(x))
  const k = rand(0, n - 1)                 // спрашиваем про позицию k (с нуля)
  const orderText = seq.join(' ')

  let question: string
  let correct: string
  let options: string[]
  let explanation: string
  if (Math.random() < 0.5) {
    correct = String(k + 1)
    question = `На каком месте был ${seq[k]}?`
    if (n === 4) {
      options = shuffle(['1', '2', '3', '4'])
    } else {
      const all = Array.from({ length: n }, (_, i) => String(i + 1))
      options = uniqueOptions(correct, all.filter((x) => x !== correct), 4)
    }
    explanation = `Порядок был такой: ${orderText}. ${seq[k]} стоял на ${k + 1}-м месте.`
  } else {
    correct = seq[k]
    question = `Какой цвет был на ${k + 1}-м месте?`
    const wrongs = [...shuffle(seq.filter((x) => x !== correct)).slice(0, 2), ...shuffle(unused).slice(0, 1)]
    options = uniqueOptions(correct, [...wrongs, ...shuffle(seq), ...shuffle(unused)], 4)
    explanation = `Порядок был такой: ${orderText}. На ${k + 1}-м месте стоял ${correct}.`
  }

  return {
    ...base(level, 'order'),
    layout: 'memorize',
    intro: 'Запомни порядок цветов слева направо',
    stimulus: { type: 'text', text: orderText, size: 'xl' },
    showMs,
    question, options, correct, explanation,
    fastSeconds: 5,
  }
}

// ───────── 6. Повтори порядок (блоки Корси) ─────────

function genCorsi(level: Level): GameTask {
  const size = level === 3 ? 4 : 3
  const cellsCount = size * size
  const len = level === 1 ? rand(3, 4) : level === 2 ? rand(5, 6) : rand(6, 7)
  const sequence: number[] = []
  while (sequence.length < len) {
    const v = rand(0, cellsCount - 1)
    if (sequence.length > 0 && sequence[sequence.length - 1] === v) continue
    sequence.push(v)
  }
  return {
    ...base(level, 'corsi'),
    xp: XP_BY_LEVEL[level] + 5,
    layout: 'corsi',
    intro: 'Клетки вспыхнут по очереди — запомни порядок',
    question: 'Смотри внимательно и повтори порядок',
    options: [],
    correct: 'ok',
    explanation: 'Это зрительно-пространственная память: представляй путь, по которому «бежит» вспышка, как линию на поле.',
    fastSeconds: len * 1.5,
    corsi: { size, sequence },
  }
}

// ───────── Выбор вида ─────────

const WEIGHTS: { kind: string; w: number }[] = [
  { kind: 'words', w: 22 },
  { kind: 'digits', w: 16 },
  { kind: 'pairs', w: 16 },
  { kind: 'gridrecall', w: 16 },
  { kind: 'order', w: 14 },
  { kind: 'corsi', w: 16 },
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

export function generateMemory(level: Level): GameTask {
  const kind = pickKind()
  lastKind = kind
  switch (kind) {
    case 'words': return genWords(level)
    case 'digits': return genDigits(level)
    case 'pairs': return genPairs(level)
    case 'gridrecall': return genGridRecall(level)
    case 'order': return genOrder(level)
    default: return genCorsi(level)
  }
}
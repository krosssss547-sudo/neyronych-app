// Тема «Счёт»: генератор заданий на устный счёт (все задания создаются на лету).
// Семь видов: порядок действий, пропущенное число, сравнение, проценты, цепочка, поиск равного, остатки и делимость.

import { rand, shuffle, pickOne, uniqueOptions, numberOptions, fmt } from './gamekit'
import { XP_BY_LEVEL } from './gametypes'
import type { GameTask, Level } from './gametypes'

export const MATH_KINDS: Record<string, string> = {
  expr: 'Порядок действий',
  missing: 'Найди пропущенное',
  compare: 'Сравни',
  percent: 'Проценты',
  chain: 'Цепочка',
  pick: 'Найди равное',
  remain: 'Остаток и делимость',
}

const TIME: Record<Level, number> = { 1: 20, 2: 24, 3: 28 }

type Body = {
  question: string
  stimulus?: string
  size?: 'md' | 'lg' | 'xl'
  options: string[]
  correct: string
  explanation: string
}

function mk(level: Level, kind: string, b: Body): GameTask {
  const timeLimit = TIME[level]
  return {
    topic: 'math',
    kind,
    kindLabel: MATH_KINDS[kind],
    level,
    layout: 'choice',
    question: b.question,
    ...(b.stimulus !== undefined ? { stimulus: { type: 'text' as const, text: b.stimulus, size: b.size ?? 'lg' } } : {}),
    options: b.options,
    correct: b.correct,
    explanation: b.explanation,
    xp: XP_BY_LEVEL[level],
    fastSeconds: Math.round(timeLimit / 3),
    timeLimit,
  }
}

// Числовые варианты со строковым видом (тысячи через пробел, необязательный суффикс)
const S = (n: number, suf = '') => fmt(n) + suf
function numOpts(correct: number, traps: number[], spread: number, suf = ''): string[] {
  return numberOptions(correct, traps.filter((t) => Number.isInteger(t)), Math.max(5, spread)).map((s) => S(Number(s), suf))
}

const divs = (n: number, min = 2, max = n): number[] => {
  const r: number[] = []
  for (let i = min; i <= Math.min(max, n); i++) if (n % i === 0) r.push(i)
  return r
}
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b

// Маленький вычислитель выражений с + − × ÷ и скобками. flat=true — все действия слева направо (типичная ошибка).
function evalStr(s: string, flat = false): number {
  const t = s.replace(/\s+/g, '').match(/\d+|[+−×÷()]/g) as string[]
  let i = 0
  const apply = (o: string, a: number, b: number) => (o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : a / b)
  const prim = (): number => {
    const x = t[i++]
    if (x === '(') { const v = add(); i++; return v }
    return Number(x)
  }
  const mul = (): number => {
    let v = prim()
    while (t[i] === '×' || t[i] === '÷') { const o = t[i++]; v = apply(o, v, prim()) }
    return v
  }
  const add = (): number => {
    let v = flat ? prim() : mul()
    while (i < t.length && t[i] !== ')') {
      const o = t[i++]
      v = apply(o, v, flat ? prim() : mul())
    }
    return v
  }
  return add()
}

// ───────── 1. Порядок действий ─────────

function genExpr(level: Level): GameTask {
  let e = ''
  let why = ''
  if (level === 1) {
    const b = rand(2, 9), c = rand(2, 9), f = rand(0, 2)
    if (f === 0) {
      const a = rand(2, 20)
      e = `${a} + ${b} × ${c}`
      why = `Сначала умножение: ${b} × ${c} = ${b * c}, потом сложение: ${a} + ${b * c} = ${a + b * c}.`
    } else if (f === 1) {
      const a = rand(2, 20)
      e = `${b} × ${c} + ${a}`
      why = `Сначала умножение: ${b} × ${c} = ${b * c}, потом сложение: ${b * c} + ${a} = ${a + b * c}.`
    } else {
      const a = b * c + rand(1, 15)
      e = `${a} − ${b} × ${c}`
      why = `Сначала умножение: ${b} × ${c} = ${b * c}, потом вычитание: ${a} − ${b * c} = ${a - b * c}.`
    }
  } else if (level === 2) {
    const f = rand(0, 2)
    if (f === 0) {
      const a = rand(2, 15), b = rand(2, 15), c = rand(2, 9)
      const d = rand(2, Math.min(40, (a + b) * c - 1))
      e = `(${a} + ${b}) × ${c} − ${d}`
      why = `Скобки: ${a} + ${b} = ${a + b}; умножаем: ${a + b} × ${c} = ${(a + b) * c}; вычитаем: ${(a + b) * c} − ${d} = ${(a + b) * c - d}.`
    } else if (f === 1) {
      const a = rand(10, 30), b = rand(2, a - 2), c = rand(2, 9), d = rand(2, 30)
      e = `(${a} − ${b}) × ${c} + ${d}`
      why = `Скобки: ${a} − ${b} = ${a - b}; умножаем: ${a - b} × ${c} = ${(a - b) * c}; прибавляем: ${(a - b) * c} + ${d} = ${(a - b) * c + d}.`
    } else {
      let a = rand(3, 12), b = rand(3, 12), c = rand(2, 9), d = rand(2, 9)
      if (a * b <= c * d) { a = rand(6, 12); b = rand(6, 12); c = rand(2, 5); d = rand(2, 5) }
      e =`${a} × ${b} − ${c} × ${d}`
      why = `Сначала оба умножения: ${a} × ${b} = ${a * b} и ${c} × ${d} = ${c * d}; потом вычитание: ${a * b} − ${c * d} = ${a * b - c * d}.`
    }
  } else {
    const f = pickOne([0, 1, 2, 2, 3, 3])
    if (f === 0) {
      const d = rand(2, 9), q = rand(3, 12), b = rand(2, 9), c = rand(2, 9)
      e = `${d * q} ÷ ${d} + ${b} × ${c}`
      why = `Сначала ÷ и ×: ${d * q} ÷ ${d} = ${q} и ${b} × ${c} = ${b * c}; потом сложение: ${q} + ${b * c} = ${q + b * c}.`
    } else if (f === 1) {
      const ee = rand(2, 6), q = rand(2, 9), a = rand(5, 30), b = rand(2, 9), c = rand(2, 9)
      e = `${a} + ${b} × ${c} − ${ee * q} ÷ ${ee}`
      why = `Сначала ${b} × ${c} = ${b * c} и ${ee * q} ÷ ${ee} = ${q}; потом ${a} + ${b * c} − ${q} = ${a + b * c - q}.`
    } else if (f === 2) {
      let a = 0, b = 0, c = 0, d = 0, ee = 0
      for (let g = 0; g < 200; g++) {
        a = rand(12, 40); b = rand(2, a - 3); c = rand(2, 12); d = rand(2, 12); ee = rand(2, 9)
        if (((a - b) * (c + d)) % ee === 0 && ((a - b) * (c + d)) / ee <= 300) break
      }
      if (((a - b) * (c + d)) % ee !== 0) { a = 20; b = 2; c = 5; d = 4; ee = 6 }
      e = `(${a} − ${b}) × (${c} + ${d}) ÷ ${ee}`
      why = `Скобки: ${a} − ${b} = ${a - b} и ${c} + ${d} = ${c + d}; ${a - b} × ${c + d} = ${(a - b) * (c + d)}; делим: ${(a - b) * (c + d)} ÷ ${ee} = ${(a - b) * (c + d) / ee}.`
    } else {
      const d = rand(2, 9), q = rand(3, 12), a = rand(1, d * q - 1), b = d * q - a, c = rand(2, 9)
      const e2 = rand(1, Math.min(30, q * c - 1))
      e = `(${a} + ${b}) ÷ ${d} × ${c} − ${e2}`
      why = `Скобки: ${a} + ${b} = ${d * q}; делим: ${d * q} ÷ ${d} = ${q}; умножаем: ${q} × ${c} = ${q * c}; вычитаем: ${q * c} − ${e2} = ${q * c - e2}.`
    }
  }
  const val = evalStr(e)
  const naive = evalStr(e, true)
  const traps = [naive, val + rand(1, 3), val - rand(1, 3), val + 10, val - 10]
  const spread = level === 1 ? 8 : level === 2 ? 12 : 20
  return mk(level, 'expr', {
    question: `Вычисли: ${e}`,
    options: numOpts(val, traps, spread),
    correct: S(val),
    explanation: why,
  })
}

// ───────── 2. Найди пропущенное ─────────

function genMissing(level: Level): GameTask {
  let eq = '', x = 0, why = ''
  let traps: number[] = []
  if (level === 1) {
    const f = rand(0, 7)
    if (f <= 1) {
      const a = rand(5, 49); x = rand(5, 50); const s = x + a
      eq = f === 0 ? `□ + ${a} = ${s}` : `${a} + □ = ${s}`
      why = `Обратное действие: ${s} − ${a} = ${x}.`
      traps = [s + a, x + 10, x - 10]
    } else if (f === 2) {
      const a = rand(5, 40), d = rand(5, 50); x = a + d
      eq = `□ − ${a} = ${d}`
      why = `Обратное действие: ${d} + ${a} = ${x}.`
      traps = [d - a, d, x + 10]
    } else if (f === 3) {
      x = rand(5, 40); const d = rand(5, 40), a = x + d
      eq = `${a} − □ = ${d}`
      why = `Неизвестное — вычитаемое: ${a} − ${d} = ${x}.`
      traps = [a + d, d, x + 10]
    } else if (f <= 5) {
      const a = rand(2, 9); x = rand(2, 9); const p = a * x
      eq = f === 4 ? `${a} × □ = ${p}` : `□ × ${a} = ${p}`
      why = `Обратное действие: ${p} ÷ ${a} = ${x}.`
      traps = [p - a, p / a + 1, p / a - 1]
    } else if (f === 6) {
      const a = rand(2, 9), q = rand(2, 9); x = a * q
      eq = `□ ÷ ${a} = ${q}`
      why = `Обратное действие: ${q} × ${a} = ${x}.`
      traps = [q, a + q, x + a]
    } else {
      x = rand(2, 9); const q = rand(2, 9), p = x * q
      eq = `${p} ÷ □ = ${q}`
      why = `Неизвестное — делитель: ${p} ÷ ${q} = ${x}.`
      traps = [q, p - q, x + 1]
    }
  } else if (level === 2) {
    const f = rand(0, 5)
    if (f === 0) {
      const a = rand(20, 99); x = rand(20, 150); const s = x + a
      eq = rand(0, 1) ? `□ + ${a} = ${s}` : `${a} + □ = ${s}`
      why = `Обратное действие: ${s} − ${a} = ${x}.`
      traps = [s + a, x + 10, x - 10]
    } else if (f === 1) {
      const a = rand(20, 80), d = rand(20, 90); x = a + d
      eq = `□ − ${a} = ${d}`
      why = `Обратное действие: ${d} + ${a} = ${x}.`
      traps = [d - a, x + 10, x - 10]
    } else if (f === 2) {
      const a = rand(3, 12); x = rand(3, 15); const p = a * x
      eq = rand(0, 1) ? `${a} × □ = ${p}` : `□ × ${a} = ${p}`
      why = `Обратное действие: ${p} ÷ ${a} = ${x}.`
      traps = [p - a, x + 1, x - 1]
    } else if (f === 3) {
      x = rand(3, 12); const q = rand(3, 15), p = x * q
      eq = `${p} ÷ □ = ${q}`
      why = `Неизвестное — делитель: ${p} ÷ ${q} = ${x}.`
      traps = [q, p - q, x + 1]
    } else if (f === 4) {
      const a = rand(3, 12), q = rand(3, 15); x = a * q
      eq = `□ ÷ ${a} = ${q}`
      why = `Обратное действие: ${q} × ${a} = ${x}.`
      traps = [q, a + q, x + a]
    } else {
      x = rand(20, 60); const d = rand(5, 40), a = x + d
      eq = `${a} − □ = ${d}`
      why = `Неизвестное — вычитаемое: ${a} − ${d} = ${x}.`
      traps = [a + d, d, x + 10]
    }
  } else {
    const f = rand(0, 5)
    if (f === 0) {
      const a = rand(2, 9), b = rand(3, 30); x = rand(3, 20); const c = a * x + b
      eq = `${a} × □ + ${b} = ${c}`
      why = `Сначала убираем ${b}: ${c} − ${b} = ${c - b}. Потом делим: ${c - b} ÷ ${a} = ${x}.`
      traps = [c - b, (c + b) / a, c / a - b]
    } else if (f === 1) {
      const a = rand(2, 9); x = rand(5, 20); const b = rand(3, Math.min(30, a * x - 3)), c = a * x - b
      eq = `${a} × □ − ${b} = ${c}`
      why = `Сначала возвращаем ${b}: ${c} + ${b} = ${c + b}. Потом делим: ${c + b} ÷ ${a} = ${x}.`
      traps = [c + b, (c - b) / a, c / a + b]
    } else if (f === 2) {
      const a = rand(2, 9), k = rand(2, 15), b = rand(2, 30); x = a * k; const c = k + b
      eq = `□ ÷ ${a} + ${b} = ${c}`
      why = `Сначала убираем ${b}: ${c} − ${b} = ${k}. Потом умножаем: ${k} × ${a} = ${x}.`
      traps = [k, c * a, x + a]
    } else if (f === 3) {
      const a = rand(2, 15), b = rand(2, 9); x = rand(3, 30); const c = (x + a) * b
      eq = `(□ + ${a}) × ${b} = ${c}`
      why = `Сначала делим: ${c} ÷ ${b} = ${x + a}. Потом вычитаем: ${x + a} − ${a} = ${x}.`
      traps = [x + a, c / b + a, c - a]
    } else if (f === 4) {
      const a = rand(2, 9), d = rand(2, 30); x = rand(2, 15); const c = a * x + d
      eq = `${c} − ${a} × □ = ${d}`
      why = `Вычитаемое равно ${c} − ${d} = ${c - d}. Тогда □ = ${c - d} ÷ ${a} = ${x}.`
      traps = [c - d, (c + d) / a, x + 1]
    } else {
      const cc = rand(2, 12), b = rand(2, 9), a = rand(2, 20); x = cc * b + a
      eq = `(□ − ${a}) ÷ ${b} = ${cc}`
      why = `Сначала умножаем: ${cc} × ${b} = ${cc * b}. Потом прибавляем: ${cc * b} + ${a} = ${x}.`
      traps = [cc * b, x - 2 * a, cc + a]
    }
  }
  const spread = level === 1 ? 8 : level === 2 ? 12 : 15
  return mk(level, 'missing', {
    question: 'Какое число пропущено?',
    stimulus: eq,
    size: 'xl',
    options: numOpts(x, traps, spread),
    correct: S(x),
    explanation: why,
  })
}

// ───────── Выражение с заданным значением (для «Сравни» и «Найди равное») ─────────

function exprFor(v: number, level: Level): string {
  const lim = level === 1 ? 10 : 16
  const divLim = level === 1 ? 100 : level === 2 ? 200 : 500
  const kinds =
    level === 1 ? ['add', 'sub', 'mul', 'muladd', 'mulsub', 'div']
      : level === 2 ? ['add', 'sub', 'mul', 'mul', 'div', 'muladd', 'mulsub']
        : ['mul', 'div', 'muladd', 'mulsub', 'brk', 'twomul', 'brk']
  for (let t = 0; t < 60; t++) {
    switch (pickOne(kinds)) {
      case 'add': {
        if (v >= 4) { const a = rand(2, v - 2); return `${a} + ${v - a}` }
        break
      }
      case 'sub': {
        const b = rand(2, level === 1 ? 20 : 60)
        return `${v + b} − ${b}`
      }
      case 'mul': {
        const ds = divs(v).filter((d) => d <= lim && v / d <= lim && v / d >= 2)
        if (ds.length) { const a = pickOne(ds); return `${a} × ${v / a}` }
        break
      }
      case 'div': {
        const e = rand(2, level === 1 ? 5 : 9)
        if (v * e <= divLim) return `${v * e} ÷ ${e}`
        break
      }
      case 'muladd': {
        const a = rand(2, 12)
        const b = Math.floor((v - rand(1, 9)) / a)
        const c = v - a * b
        if (b >= 2 && c >= 1 && c <= 30) return `${a} × ${b} + ${c}`
        break
      }
      case 'mulsub': {
        const a = rand(2, 12)
        const b = Math.ceil((v + rand(1, 9)) / a)
        const c = a * b - v
        if (b >= 2 && b <= 20 && c >= 1 && c <= 30) return `${a} × ${b} − ${c}`
        break
      }
      case 'brk': {
        const cs = divs(v).filter((d) => d <= 12 && v / d >= 4)
        if (cs.length) {
          const c = pickOne(cs), s = v / c, a = rand(2, s - 2)
          return `(${a} + ${s - a}) × ${c}`
        }
        break
      }
      case 'twomul': {
        const a = rand(2, 9), b = rand(2, 9), r = v - a * b
        if (r >= 4) {
          const ds = divs(r).filter((d) => d <= 9 && r / d <= 9 && r / d >= 2)
          if (ds.length) { const d = pickOne(ds); return `${a} × ${b} + ${d} × ${r / d}` }
        }
        break
      }
    }
  }
  return `${v - 1} + 1`
}

// ───────── 3. Сравни ─────────

function genCompare(level: Level): GameTask {
  const [lo, hi] = level === 1 ? [12, 60] : level === 2 ? [30, 150] : [60, 400]
  const tie = Math.random() < 0.2
  const maxD = level === 1 ? 6 : level === 2 ? 8 : 12
  let e1 = '', e2 = '', v1 = 0, v2 = 0
  for (let g = 0; g < 20; g++) {
    const base = rand(lo, hi)
    const delta = tie ? 0 : rand(1, maxD) * (Math.random() < 0.5 ? 1 : -1)
    e1 = exprFor(base, level)
    e2 = exprFor(base + delta, level)
    v1 = evalStr(e1)
    v2 = evalStr(e2)
    if (e1 !== e2 && v1 - v2 === -delta) break
  }
  const correct = v1 > v2 ? 'Первое больше' : v1 < v2 ? 'Второе больше' : 'Равны'
  const tail = v1 > v2 ? 'Значит, первое больше.' : v1 < v2 ? 'Значит, второе больше.' : 'Значит, они равны.'
  return mk(level, 'compare', {
    question: 'Что больше?',
    stimulus: `1) ${e1}\n2) ${e2}`,
    size: 'xl',
    options: shuffle(['Первое больше', 'Второе больше', 'Равны']),
    correct,
    explanation: `${e1} = ${v1}, ${e2} = ${v2}. ${tail}`,
  })
}

// ───────── 4. Проценты ─────────

function genPercent(level: Level): GameTask {
  if (level === 1) {
    const p = pickOne([50, 10, 25])
    const base = p === 10 ? rand(1, 50) * 10 : rand(2, 20) * 20
    const ans = (base * p) / 100
    const traps = [base / 2, base / 10, base / 4, base - ans].filter((x) => x !== ans)
    const why = p === 50 ? `50% — это половина: ${fmt(base)} ÷ 2 = ${fmt(ans)}.`
      : p === 10 ? `10% — это десятая часть: ${fmt(base)} ÷ 10 = ${fmt(ans)}.`
        : `25% — это четверть: ${fmt(base)} ÷ 4 = ${fmt(ans)}.`
    return mk(level, 'percent', {
      question: pickOne([`Найди ${p}% от ${fmt(base)}`, `Сколько будет ${p}% от ${fmt(base)}?`]),
      options: numOpts(ans, traps, Math.max(5, Math.round(ans / 4))),
      correct: S(ans),
      explanation: why,
    })
  }
  if (level === 2) {
    const p = pickOne([15, 20, 30, 40, 60, 75, 5])
    const step = 100 / gcd(p, 100)
    const m = step % 10 === 0 ? step : step % 5 === 0 ? 10 : 20
    const base = m * rand(Math.ceil(40 / m), Math.floor(500 / m))
    const ans = (base * p) / 100
    const traps = [(base * (100 - p)) / 100, base / 10, base / 5, (base * p) / 10]
    return mk(level, 'percent', {
      question: pickOne([`Найди ${p}% от ${fmt(base)}`, `Сколько будет ${p}% от ${fmt(base)}?`]),
      options: numOpts(ans, traps, Math.max(6, Math.round(ans / 4))),
      correct: S(ans),
      explanation: `${p}% от ${fmt(base)}: ${fmt(base)} × ${p} ÷ 100 = ${fmt(ans)}.`,
    })
  }
  const f = pickOne([0, 1, 2, 3, 4])
  if (f <= 1) {
    const up = f === 1
    const p = pickOne(up ? [10, 20, 25, 30, 50] : [10, 15, 20, 25, 30, 40])
    const base = 20 * rand(10, 100)
    const ch = (base * p) / 100
    const ans = up ? base + ch : base - ch
    const q = up
      ? pickOne([`Товар стоил ${fmt(base)} ₽, цену повысили на ${p}%. Новая цена?`, `Билет стоил ${fmt(base)} ₽, а цену повысили на ${p}%. Сколько он стоит теперь?`])
      : pickOne([`Товар стоил ${fmt(base)} ₽, цену снизили на ${p}%. Новая цена?`, `Куртка стоила ${fmt(base)} ₽, но действует скидка ${p}%. Сколько нужно заплатить?`])
    const traps = [up ? base - ch : base + ch, ch, up ? base + p : base - p]
    return mk(level, 'percent', {
      question: q,
      options: numOpts(ans, traps, Math.max(20, Math.round(ch / 2)), ' ₽'),
      correct: S(ans, ' ₽'),
      explanation: `${p}% от ${fmt(base)} ₽ — это ${fmt(ch)} ₽. ${fmt(base)} ${up ? '+' : '−'} ${fmt(ch)} = ${fmt(ans)} ₽.`,
    })
  }
  if (f === 2 || f === 3) {
    const p = pickOne([5, 10, 15, 20, 25, 30, 35, 40, 45, 60, 65, 70, 75, 80, 90])
    const base = 20 * rand(2, 30)
    const part = (base * p) / 100
    const pool: number[] = []
    for (const d of [5, 10, 15, 20]) pool.push(p + d, p - d)
    pool.push(100 - p)
    const wrongs = pool.filter((v) => v >= 1 && v <= 100 && v !== p).map((v) => `${v}%`)
    return mk(level, 'percent', {
      question: `Сколько процентов составляет ${fmt(part)} от ${fmt(base)}?`,
      options: uniqueOptions(`${p}%`, wrongs),
      correct: `${p}%`,
      explanation: `${fmt(part)} ÷ ${fmt(base)} = ${String(p / 100).replace(".", ",")}, то есть ${p}%.`,
    })
  }
  const p = pickOne([10, 20, 25, 40, 50, 5, 75])
  const base = 20 * rand(2, 30)
  const part = (base * p) / 100
  const traps = [part * 10, (part * p) / 100, part + p, base + part, part * 2]
  return mk(level, 'percent', {
    question: `Найди число, если ${p}% от него равны ${fmt(part)}.`,
    options: numOpts(base, traps, Math.max(20, Math.round(base / 5))),
    correct: S(base),
    explanation: `${p}% — это ${fmt(part)}, значит 1% — это ${fmt(part)} ÷ ${p}, а всё число: ${fmt(part)} × 100 ÷ ${p} = ${fmt(base)}.`,
  })
}

// ───────── 5. Цепочка ─────────

type Step = { o: string; n: number }

function tryChain(level: Level): { start: number; steps: Step[]; vals: number[] } | null {
  const count = level + 2
  const limit = level === 1 ? 100 : level === 2 ? 150 : 300
  const start = level === 1 ? rand(3, 20) : rand(4, 25)
  let cur = start
  const steps: Step[] = []
  const vals: number[] = [start]
  let prev = ''
  for (let i = 0; i < count; i++) {
    const cand: Step[] = []
    const addN = rand(2, level === 1 ? 15 : 25)
    if (cur + addN <= limit) cand.push({ o: '+', n: addN })
    if (cur >= 4) cand.push({ o: '−', n: rand(2, Math.min(cur - 1, 25)) })
    if (level >= 2) {
      const mN = rand(2, level === 2 ? 4 : 5)
      if (cur * mN <= limit) cand.push({ o: '×', n: mN })
    }
    if (level === 3) {
      const ds = divs(cur, 2, 9).filter((d) => cur / d >= 2)
      if (ds.length) cand.push({ o: '÷', n: pickOne(ds) })
    }
    const last = steps[steps.length - 1]
    const cancels = (c: Step) => !!last && c.n === last.n && ((c.o === '+' && last.o === '−') || (c.o === '−' && last.o === '+') || (c.o === '×' && last.o === '÷') || (c.o === '÷' && last.o === '×'))
    const pool = cand.filter((c) => c.o !== prev && !cancels(c))
    const use = pool.length ? pool : cand
    if (!use.length) return null
    const s = pickOne(use)
    cur = s.o === '+' ? cur + s.n : s.o === '−' ? cur - s.n : s.o === '×' ? cur * s.n : cur / s.n
    steps.push(s)
    vals.push(cur)
    prev = s.o
  }
  if (level === 3 && !(steps.some((s) => s.o === '÷') && steps.some((s) => s.o === '×'))) return null
  return { start, steps, vals }
}

function genChain(level: Level): GameTask {
  let ch = tryChain(level)
  for (let g = 0; g < 100 && !ch; g++) ch = tryChain(level)
  if (!ch) ch = { start: 10, steps: [{ o: '+', n: 5 }, { o: '×', n: 2 }, { o: '−', n: 4 }], vals: [10, 15, 30, 26] }
  const { start, steps, vals } = ch
  const ans = vals[vals.length - 1]
  const before = vals[vals.length - 2]
  const last = steps[steps.length - 1]
  const swapped = last.o === '+' ? before - last.n : last.o === '−' ? before + last.n : last.o === '×' ? before / last.n : before * last.n
  const traps = [before, swapped, ans + 1, ans - 1, ans + 10, ans - 10]
  const stim = [String(start), ...steps.map((s) => `${s.o}${s.n}`)].join(' → ')
  const work = steps.map((s, i) => `${vals[i]} ${s.o} ${s.n} = ${vals[i + 1]}`).join(', ')
  return mk(level, 'chain', {
    question: 'Что получится в конце?',
    stimulus: stim,
    size: 'xl',
    options: numOpts(ans, traps, level === 1 ? 8 : level === 2 ? 12 : 16),
    correct: S(ans),
    explanation: `Идём по шагам: ${work}.`,
  })
}

// ───────── 6. Найди равное ─────────

function genPick(level: Level): GameTask {
  const [lo, hi] = level === 1 ? [12, 50] : level === 2 ? [25, 120] : [50, 300]
  let t = 0
  let exprs: string[] = []
  let vals: number[] = []
  for (let g = 0; g < 30; g++) {
    t = rand(lo, hi)
    vals = [t, ...shuffle([-4, -3, -2, -1, 1, 2, 3, 4]).slice(0, 3).map((d) => t + d)]
    exprs = vals.map((v) => exprFor(v, level))
    const ok = new Set(exprs).size === 4 && exprs.every((e, i) => evalStr(e) === vals[i])
    if (ok) break
  }
  const others = vals.slice(1)
  return mk(level, 'pick', {
    question: `Какое выражение равно ${t}?`,
    options: shuffle(exprs),
    correct: exprs[0],
    explanation: `Верно: ${exprs[0]} = ${t}. Остальные дают ${others[0]}, ${others[1]} и ${others[2]}.`,
  })
}

// ───────── 7. Остаток и делимость ─────────

const LCM_PAIRS: [number, number][] = [
  [4, 6], [6, 8], [4, 10], [6, 9], [8, 12], [6, 10], [9, 12], [10, 15], [12, 18], [8, 10], [14, 21], [12, 16], [15, 20], [6, 14],
]
const GCD_PAIRS: [number, number][] = [
  [24, 36], [18, 27], [30, 45], [48, 72], [28, 42], [16, 40], [36, 60], [45, 75], [54, 72],
]

function genRemain(level: Level): GameTask {
  if (level === 1) {
    const d = pickOne([3, 4, 6, 7, 8, 9])
    const not = Math.random() < 0.3
    const isMul = (n: number) => n % d === 0
    const mults: number[] = []
    for (let k = 2; k * d <= 99; k++) if (k * d >= 12) mults.push(k * d)
    const near = (m: number) => [m - 2, m - 1, m + 1, m + 2].filter((x) => x >= 12 && x <= 99 && !isMul(x))
    if (!not) {
      const m = pickOne(mults)
      const wrongs = shuffle([...near(m), ...near(pickOne(mults))]).filter((x) => x !== m)
      const set = [...new Set(wrongs)].slice(0, 3)
      return mk(level, 'remain', {
        question: `Какое число делится на ${d}?`,
        options: shuffle([String(m), ...set.map(String)]),
        correct: String(m),
        explanation: `${m} = ${d} × ${m / d}, поэтому ${m} делится на ${d} без остатка.`,
      })
    }
    const ms = [...new Set(shuffle(mults).slice(0, 3))]
    const w = pickOne(near(pickOne(mults)))
    return mk(level, 'remain', {
      question: `Какое число НЕ делится на ${d}?`,
      options: shuffle([String(w), ...ms.map(String)]),
      correct: String(w),
      explanation: `${w} = ${d} × ${Math.floor(w / d)} + ${w % d}, остаток ${w % d} — значит, нацело не делится.`,
    })
  }
  if (level === 2) {
    if (Math.random() < 0.65) {
      const d = rand(3, 9)
      let n = rand(20, 99)
      while (n % d === 0) n = rand(20, 99)
      const r = n % d, q = Math.floor(n / d)
      return mk(level, 'remain', {
        question: `Остаток от деления ${n} на ${d}?`,
        options: numOpts(r, [q, d - r, r + 1, r - 1], Math.max(3, d - 1)),
        correct: String(r),
        explanation: `${n} = ${d} × ${q} + ${r}, значит остаток ${r}.`,
      })
    }
    const d = rand(3, 9), r = rand(1, d - 1)
    const k = rand(3, Math.floor(95 / d)), m = d * k + r
    const wrongs = [m - 1, m + 1, m - 2, m + 2, m + d + 1, m - d + 1, m + d - 1].filter((x) => x >= 10 && x % d !== r).map(String)
    return mk(level, 'remain', {
      question: `Какое число при делении на ${d} даёт остаток ${r}?`,
      options: uniqueOptions(String(m), wrongs),
      correct: String(m),
      explanation: `${m} = ${d} × ${k} + ${r}, остаток равен ${r}.`,
    })
  }
  const f = pickOne(['lcm', 'lcm', 'gcd', 'gcd', 'both', 'both'] as const)
  if (f === 'lcm') {
    const [a, b] = pickOne(LCM_PAIRS)
    const L = lcm(a, b)
    const traps = [a * b, Math.max(a, b), L * 2, a + b, L + a, L - a]
    return mk(level, 'remain', {
      question: `Какое наименьшее число делится и на ${a}, и на ${b}?`,
      options: numOpts(L, traps.filter((x) => x !== L), 8),
      correct: String(L),
      explanation: `Кратные ${Math.max(a, b)}: ${[1, 2, 3, 4].map((i) => Math.max(a, b) * i).join(', ')}… Первое из них, которое делится и на ${Math.min(a, b)}, — ${L}.`,
    })
  }
  if (f === 'gcd') {
    const [a, b] = pickOne(GCD_PAIRS)
    const G = gcd(a, b)
    const traps = [G / 2, G * 2, Math.min(a, b), Math.abs(a - b) === G ? G + 1 : Math.abs(a - b), G + 1, G - 1]
    return mk(level, 'remain', {
      question: `Какое наибольшее число делит и ${a}, и ${b} нацело?`,
      options: numOpts(G, traps.filter((x) => x !== G), 5),
      correct: String(G),
      explanation: `${a} = ${G} × ${a / G} и ${b} = ${G} × ${b / G}, а у множителей ${a / G} и ${b / G} общих делителей больше нет. Ответ: ${G}.`,
    })
  }
  const [a, b] = pickOne(LCM_PAIRS)
  const L = lcm(a, b)
  const m = L * rand(1, Math.max(1, Math.floor(150 / L)))
  const both = (x: number) => x % a === 0 && x % b === 0
  const ws = new Set<number>()
  for (let g = 0; g < 200 && ws.size < 3; g++) {
    const x = (Math.random() < 0.5 ? a : b) * rand(2, Math.floor(150 / Math.min(a, b)))
    if (!both(x) && x !== m && x >= 12) ws.add(x)
  }
  const wl = [...ws]
  return mk(level, 'remain', {
    question: `Какое число делится и на ${a}, и на ${b}?`,
    options: shuffle([String(m), ...wl.map(String)]),
    correct: String(m),
    explanation: `Общие кратные ${a} и ${b} — это числа, кратные ${L}. Среди вариантов подходит только ${m}: ${m} ÷ ${a} = ${m / a}, ${m} ÷ ${b} = ${m / b}.`,
  })
}

// ───────── Выбор вида ─────────

const WEIGHTS: { kind: string; w: number }[] = [
  { kind: 'expr', w: 22 }, { kind: 'missing', w: 18 }, { kind: 'compare', w: 14 }, { kind: 'percent', w: 16 },
  { kind: 'chain', w: 16 }, { kind: 'pick', w: 8 }, { kind: 'remain', w: 8 },
]

let lastKind = ''

function pickKind(): string {
  const opts = WEIGHTS.filter((o) => o.kind !== lastKind)
  let r = Math.random() * opts.reduce((a, o) => a + o.w, 0)
  for (const o of opts) {
    r -= o.w
    if (r <= 0) return o.kind
  }
  return opts[0].kind
}

export function generateMath(level: Level): GameTask {
  const kind = pickKind()
  lastKind = kind
  switch (kind) {
    case 'expr': return genExpr(level)
    case 'missing': return genMissing(level)
    case 'compare': return genCompare(level)
    case 'percent': return genPercent(level)
    case 'chain': return genChain(level)
    case 'pick': return genPick(level)
    default: return genRemain(level)
  }
}

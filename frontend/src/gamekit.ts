// Мелкие общие помощники для генераторов заданий.

export const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const pickOne = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)]
export const pickN = <T,>(arr: T[], n: number): T[] => shuffle(arr).slice(0, n)

// Число с пробелами между тысячами: 12345 -> «12 345» (неразрывный пробел не используем — обычный)
export function fmt(n: number): string {
  const s = String(Math.abs(Math.trunc(n)))
  const g = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return n < 0 ? '−' + g : g
}

// Собирает варианты ответа: правильный + неправильные (дубли и совпадения с правильным убираются),
// всего не больше `n`, порядок случайный. Возвращает массив, в котором правильный точно есть.
export function uniqueOptions(correct: string, wrongs: string[], n = 4): string[] {
  const seen = new Set<string>([correct])
  const out: string[] = []
  for (const w of shuffle(wrongs)) {
    if (!seen.has(w)) { seen.add(w); out.push(w) }
    if (out.length >= n - 1) break
  }
  return shuffle([correct, ...out])
}

// Числовые варианты: правильное + «ловушки» (близкие числа) + добор случайными рядом с правильным.
// allowNegative=false — отрицательные и нулевые не берём.
export function numberOptions(correct: number, traps: number[], spread: number, n = 4, allowNegative = false): string[] {
  const set = new Set<number>([correct])
  for (const t of traps) if (t !== correct && (allowNegative || t > 0) && Number.isFinite(t)) set.add(t)
  let guard = 0
  while (set.size < n && guard++ < 500) {
    const v = correct + rand(-spread, spread)
    if (v !== correct && (allowNegative || v > 0)) set.add(v)
  }
  const wrongs = [...set].filter((v) => v !== correct)
  return shuffle([correct, ...shuffle(wrongs).slice(0, n - 1)]).map((v) => String(v))
}

// Не выдавать подряд один и тот же вид задания и не повторять недавние элементы банка.
export function makeRecent(size: number) {
  const list: string[] = []
  return {
    has: (id: string) => list.includes(id),
    add: (id: string) => { list.push(id); if (list.length > size) list.shift() },
    reset: () => { list.length = 0 },
  }
}
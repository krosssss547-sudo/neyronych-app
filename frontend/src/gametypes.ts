// Общие типы для всех мини-игр (Память, Внимание, Логика, Счёт, Скорость, Цвета, Слова).
// Генераторы (game-*.ts) только создают GameTask, а весь показ и ввод делает App.tsx.

export type Level = 1 | 2 | 3

export type GameTopic = 'memory' | 'attention' | 'logic' | 'math' | 'speed' | 'colors' | 'words'

// Одна клетка сетки
export type Cell = {
  text: string      // что написано (эмодзи, слово, число). Может быть пустой строкой
  color?: string    // цвет текста (css, например '#EF4444') — нужно для «Цветов»
  bg?: string       // цвет фона клетки (css)
}

export type Stimulus =
  | { type: 'text'; text: string; size?: 'md' | 'lg' | 'xl' }                 // текст; '\n' — перенос строки
  | { type: 'cells'; cells: Cell[]; cols: number; size?: 'sm' | 'md' | 'lg' } // сетка клеток

// layout — как задание показывается и как игрок отвечает:
//  'choice'   — стимул (необязательный) + вопрос + варианты. Если задан timeLimit — идёт таймер.
//  'memorize' — сначала показывается ТОЛЬКО стимул на showMs миллисекунд (с полоской времени),
//               потом он исчезает и появляются вопрос + варианты.
//  'tap'      — сетка tap.cells; игрок тапает клетку. question — инструкция. correct = индекс клетки строкой ('7').
//  'schulte'  — таблица Шульте: игрок тапает числа по порядку 1..N. correct = 'ok'.
//  'corsi'    — «Саймон»: подсвечивается последовательность клеток, игрок повторяет. correct = 'ok'.
export type Layout = 'choice' | 'memorize' | 'tap' | 'schulte' | 'corsi'

export type GameTask = {
  topic: GameTopic
  kind: string            // id вида задания (латиница, например 'words')
  kindLabel: string       // название вида по-русски (например 'Список слов')
  level: Level
  layout: Layout

  intro?: string          // короткая подсказка над заданием («Запомни слова»). Для memorize показывается пока виден стимул
  chip?: string           // плашка-правило («Выбери ЦВЕТ буквы»), показывается над вопросом
  question: string        // вопрос / инструкция. Может содержать '\n'
  questionColor?: string  // окрасить текст вопроса (для «Цветов»)
  stimulus?: Stimulus     // то, что показывают (для memorize — то, что надо запомнить)
  showMs?: number         // только memorize

  options: string[]       // choice/memorize: 2–4 варианта, все РАЗНЫЕ, среди них ровно один correct. Для tap/schulte/corsi — []
  correct: string         // choice/memorize: текст правильного варианта; tap: индекс клетки строкой; schulte/corsi: 'ok'
  explanation: string     // короткое пояснение после ответа (по-русски, 1–2 предложения)

  xp: number              // базовые очки опыта: обычно 10 / 15 / 25 для уровней 1 / 2 / 3
  fastSeconds: number     // ответ быстрее этого времени (от появления вопроса) даёт бонус
  timeLimit?: number      // секунд на ответ; по истечении — ошибка. Для schulte — общее время на таблицу

  tap?: { cells: Cell[]; cols: number }
  schulte?: { numbers: number[]; cols: number }    // numbers — в том порядке, как лежат в сетке; cols*cols штук
  corsi?: { size: number; sequence: number[] }     // size — сторона сетки (3 → 9 клеток), sequence — индексы 0..size*size-1
}

export const XP_BY_LEVEL: Record<Level, number> = { 1: 10, 2: 15, 3: 25 }
// Достижения. Считаются прямо в приложении по статистике игрока — серверу ничего не нужно.

import type { MatrixProfile } from './matrices'
import type { ReadingProfile } from './reading'

export type StatsLite = {
  current_streak: number
  longest_streak: number
  total_xp: number
  level: number
  total: number
  correct: number
  by_category: { category: string; total: number; correct: number }[]
}

export type Meta = { perfectSeries: number }

export type AchievementContext = {
  stats: StatsLite | null
  matrix: MatrixProfile
  reading: ReadingProfile
  meta: Meta
}

type Bi = { ru: string; en: string }

export type GroupId = 'streak' | 'answers' | 'level' | 'mastery' | 'matrices' | 'reading'

export type AchievementDef = {
  id: string
  emoji: string
  group: GroupId
  title: Bi
  description: Bi
  target: number
  value: (c: AchievementContext) => number
}

export const ACHIEVEMENT_GROUPS: { id: GroupId; title: Bi }[] = [
  { id: 'streak', title: { ru: 'Серии', en: 'Streaks' } },
  { id: 'answers', title: { ru: 'Верные ответы', en: 'Correct answers' } },
  { id: 'level', title: { ru: 'Уровень и опыт', en: 'Level & XP' } },
  { id: 'mastery', title: { ru: 'Мастерство', en: 'Mastery' } },
  { id: 'matrices', title: { ru: 'Матрицы', en: 'Matrices' } },
  { id: 'reading', title: { ru: 'Скорочтение', en: 'Speed reading' } },
]

const FREE_TOPICS = ['memory', 'attention', 'logic', 'math', 'differences', 'speed', 'colors', 'words']
const ALL_TOPICS = [...FREE_TOPICS, 'matrices', 'reading']

const st = (c: AchievementContext) => c.stats
const catCorrect = (c: AchievementContext, cat: string) => c.stats?.by_category.find((x) => x.category === cat)?.correct ?? 0
const catTotal = (c: AchievementContext, cat: string) => c.stats?.by_category.find((x) => x.category === cat)?.total ?? 0
const kindsSolved = (kinds: Record<string, { t: number; c: number }>) => Object.values(kinds).filter((k) => k.c >= 1).length

export const ACHIEVEMENTS: AchievementDef[] = [
  // Серии
  { id: 'streak_3', emoji: '🔥', group: 'streak', target: 3, title: { ru: '3 дня подряд', en: '3-day streak' }, description: { ru: 'Занимайся 3 дня подряд', en: 'Train 3 days in a row' }, value: (c) => st(c)?.longest_streak ?? 0 },
  { id: 'streak_5', emoji: '🔥', group: 'streak', target: 5, title: { ru: '5 дней подряд', en: '5-day streak' }, description: { ru: 'Держи стрик 5 дней', en: 'Keep a 5-day streak' }, value: (c) => st(c)?.longest_streak ?? 0 },
  { id: 'streak_10', emoji: '🔥', group: 'streak', target: 10, title: { ru: '10 дней подряд', en: '10-day streak' }, description: { ru: 'Держи стрик 10 дней', en: 'Keep a 10-day streak' }, value: (c) => st(c)?.longest_streak ?? 0 },
  { id: 'streak_30', emoji: '🌋', group: 'streak', target: 30, title: { ru: '30 дней подряд', en: '30-day streak' }, description: { ru: 'Целый месяц без пропусков', en: 'A whole month without a break' }, value: (c) => st(c)?.longest_streak ?? 0 },

  // Верные ответы
  { id: 'correct_10', emoji: '👣', group: 'answers', target: 10, title: { ru: 'Первые шаги', en: 'First steps' }, description: { ru: '10 правильных ответов', en: '10 correct answers' }, value: (c) => st(c)?.correct ?? 0 },
  { id: 'correct_50', emoji: '✅', group: 'answers', target: 50, title: { ru: '50 правильных', en: '50 correct' }, description: { ru: 'Ответь правильно 50 раз', en: 'Answer correctly 50 times' }, value: (c) => st(c)?.correct ?? 0 },
  { id: 'correct_100', emoji: '✅', group: 'answers', target: 100, title: { ru: '100 правильных', en: '100 correct' }, description: { ru: 'Ответь правильно 100 раз', en: 'Answer correctly 100 times' }, value: (c) => st(c)?.correct ?? 0 },
  { id: 'correct_250', emoji: '🎯', group: 'answers', target: 250, title: { ru: '250 правильных', en: '250 correct' }, description: { ru: 'Ответь правильно 250 раз', en: 'Answer correctly 250 times' }, value: (c) => st(c)?.correct ?? 0 },
  { id: 'correct_500', emoji: '🏹', group: 'answers', target: 500, title: { ru: '500 правильных', en: '500 correct' }, description: { ru: 'Полтысячи верных ответов', en: 'Half a thousand correct answers' }, value: (c) => st(c)?.correct ?? 0 },
  { id: 'correct_1000', emoji: '💯', group: 'answers', target: 1000, title: { ru: 'Тысяча!', en: 'One thousand!' }, description: { ru: '1000 правильных ответов', en: '1000 correct answers' }, value: (c) => st(c)?.correct ?? 0 },

  // Уровень и опыт
  { id: 'level_5', emoji: '⭐', group: 'level', target: 5, title: { ru: '5 уровень', en: 'Level 5' }, description: { ru: 'Достигни 5 уровня', en: 'Reach level 5' }, value: (c) => st(c)?.level ?? 0 },
  { id: 'level_10', emoji: '⭐', group: 'level', target: 10, title: { ru: '10 уровень', en: 'Level 10' }, description: { ru: 'Достигни 10 уровня', en: 'Reach level 10' }, value: (c) => st(c)?.level ?? 0 },
  { id: 'level_20', emoji: '🌟', group: 'level', target: 20, title: { ru: '20 уровень', en: 'Level 20' }, description: { ru: 'Достигни 20 уровня', en: 'Reach level 20' }, value: (c) => st(c)?.level ?? 0 },
  { id: 'xp_500', emoji: '💫', group: 'level', target: 500, title: { ru: '500 XP', en: '500 XP' }, description: { ru: 'Набери 500 очков опыта', en: 'Earn 500 XP' }, value: (c) => st(c)?.total_xp ?? 0 },
  { id: 'xp_2000', emoji: '✨', group: 'level', target: 2000, title: { ru: '2000 XP', en: '2000 XP' }, description: { ru: 'Набери 2000 очков опыта', en: 'Earn 2000 XP' }, value: (c) => st(c)?.total_xp ?? 0 },
  { id: 'xp_5000', emoji: '🚀', group: 'level', target: 5000, title: { ru: '5000 XP', en: '5000 XP' }, description: { ru: 'Набери 5000 очков опыта', en: 'Earn 5000 XP' }, value: (c) => st(c)?.total_xp ?? 0 },

  // Мастерство
  { id: 'category_master', emoji: '🏅', group: 'mastery', target: 20, title: { ru: 'Мастер темы', en: 'Topic master' }, description: { ru: '20 правильных в одной теме', en: '20 correct in one topic' }, value: (c) => Math.max(0, ...(st(c)?.by_category.map((x) => x.correct) ?? [0])) },
  { id: 'all_rounder', emoji: '🧩', group: 'mastery', target: 8, title: { ru: 'Универсал', en: 'All-rounder' }, description: { ru: 'Минимум 5 верных в каждой из 8 базовых тем', en: 'At least 5 correct in each of the 8 core topics' }, value: (c) => FREE_TOPICS.filter((t) => catCorrect(c, t) >= 5).length },
  { id: 'trainer_all', emoji: '🗺️', group: 'mastery', target: 10, title: { ru: 'Исследователь', en: 'Explorer' }, description: { ru: 'Попробуй все 10 тем', en: 'Try all 10 topics' }, value: (c) => ALL_TOPICS.filter((t) => catTotal(c, t) >= 1).length },
  { id: 'perfect_1', emoji: '💎', group: 'mastery', target: 1, title: { ru: 'Без ошибок', en: 'Flawless' }, description: { ru: 'Пройди серию из 5 заданий без единой ошибки', en: 'Finish a 5-task series without a single mistake' }, value: (c) => c.meta.perfectSeries },
  { id: 'perfect_10', emoji: '👑', group: 'mastery', target: 10, title: { ru: 'Безупречный', en: 'Perfectionist' }, description: { ru: '10 идеальных серий', en: '10 perfect series' }, value: (c) => c.meta.perfectSeries },

  // Матрицы
  { id: 'matrix_10', emoji: '🔲', group: 'matrices', target: 10, title: { ru: 'Первые матрицы', en: 'First matrices' }, description: { ru: 'Реши 10 матриц', en: 'Solve 10 matrices' }, value: (c) => c.matrix.solved },
  { id: 'matrix_50', emoji: '🔳', group: 'matrices', target: 50, title: { ru: 'Матричный боец', en: 'Matrix fighter' }, description: { ru: 'Реши 50 матриц', en: 'Solve 50 matrices' }, value: (c) => c.matrix.solved },
  { id: 'matrix_200', emoji: '🧬', group: 'matrices', target: 200, title: { ru: 'Матричный гуру', en: 'Matrix guru' }, description: { ru: 'Реши 200 матриц', en: 'Solve 200 matrices' }, value: (c) => c.matrix.solved },
  { id: 'matrix_analyst', emoji: '🔷', group: 'matrices', target: 500, title: { ru: 'Ранг «Аналитик»', en: 'Rank: Analyst' }, description: { ru: 'Набери 500 очков в матрицах', en: 'Earn 500 matrix points' }, value: (c) => c.matrix.points },
  { id: 'matrix_master', emoji: '🧠', group: 'matrices', target: 2500, title: { ru: 'Ранг «Мастер»', en: 'Rank: Master' }, description: { ru: 'Набери 2500 очков в матрицах', en: 'Earn 2500 matrix points' }, value: (c) => c.matrix.points },
  { id: 'matrix_types', emoji: '🧪', group: 'matrices', target: 14, title: { ru: 'Знаток закономерностей', en: 'Pattern expert' }, description: { ru: 'Реши хотя бы по одной задаче всех 14 типов', en: 'Solve at least one task of all 14 types' }, value: (c) => kindsSolved(c.matrix.kinds) },

  // Скорочтение
  { id: 'reading_10', emoji: '📖', group: 'reading', target: 10, title: { ru: 'Читатель', en: 'Reader' }, description: { ru: '10 верных ответов в скорочтении', en: '10 correct answers in speed reading' }, value: (c) => c.reading.solved },
  { id: 'reading_50', emoji: '📚', group: 'reading', target: 50, title: { ru: 'Книжный червь', en: 'Bookworm' }, description: { ru: '50 верных ответов в скорочтении', en: '50 correct answers in speed reading' }, value: (c) => c.reading.solved },
  { id: 'wpm_250', emoji: '👁️', group: 'reading', target: 250, title: { ru: 'Быстрый взгляд', en: 'Quick eye' }, description: { ru: 'Достигни скорости чтения 250 слов в минуту', en: 'Reach a reading speed of 250 words per minute' }, value: (c) => c.reading.peakWpm },
  { id: 'wpm_350', emoji: '🚀', group: 'reading', target: 350, title: { ru: 'Скоростной', en: 'Speedster' }, description: { ru: 'Достигни скорости чтения 350 слов в минуту', en: 'Reach a reading speed of 350 words per minute' }, value: (c) => c.reading.peakWpm },
  { id: 'wpm_500', emoji: '⚡', group: 'reading', target: 500, title: { ru: 'Реактивный', en: 'Jet reader' }, description: { ru: 'Достигни скорости чтения 500 слов в минуту', en: 'Reach a reading speed of 500 words per minute' }, value: (c) => c.reading.peakWpm },
  { id: 'reading_types', emoji: '🎓', group: 'reading', target: 5, title: { ru: 'Все упражнения', en: 'All drills' }, description: { ru: 'Реши хотя бы по одному заданию всех 5 типов скорочтения', en: 'Solve at least one of all 5 speed-reading drills' }, value: (c) => kindsSolved(c.reading.kinds) },
]

export type AchievementState = { def: AchievementDef; value: number; unlocked: boolean; pct: number }

export function evaluateAchievements(input: AchievementContext): AchievementState[] {
  // если сервер вернул что-то странное — считаем, что статистики нет (а не падаем)
  const ctx: AchievementContext = { ...input, stats: input.stats && Array.isArray(input.stats.by_category) ? input.stats : null }
  return ACHIEVEMENTS.map((def) => {
    let value = 0
    try { value = Math.max(0, Number(def.value(ctx)) || 0) } catch { value = 0 }
    return { def, value, unlocked: value >= def.target, pct: Math.min(100, Math.round((value / def.target) * 100)) }
  })
}

// ───────── Локальное хранение ─────────

const META_KEY = 'neyronych_meta_v1'
const SEEN_KEY = 'neyronych_ach_seen_v1'

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) return { perfectSeries: Number(JSON.parse(raw).perfectSeries) || 0 }
  } catch { /* ignore */ }
  return { perfectSeries: 0 }
}

export function saveMeta(m: Meta): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)) } catch { /* ignore */ }
}

// null — ещё ни разу не сохраняли (первый запуск): тогда уже полученные достижения не показываем как «новые»
export function loadSeenAchievements(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.map(String)
    }
  } catch { /* ignore */ }
  return null
}

export function saveSeenAchievements(ids: string[]): void {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}
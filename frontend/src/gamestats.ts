// Прогресс игрока по мини-играм: очки, ранги, комбо, сильные и слабые стороны.
// Хранится на телефоне (localStorage), как и профили матриц и скорочтения.

import type { GameTopic, Level } from './gametypes'
import { gameKindLabel } from './games'

export type ProfileTopic = GameTopic | 'differences'

export type GameProfile = {
  points: number
  solved: number
  total: number
  bestCombo: number
  fast: number                                   // сколько раз ответил правильно и быстро
  kinds: Record<string, { t: number; c: number }>
}

export type GameProfiles = Record<ProfileTopic, GameProfile>

export const PROFILE_TOPICS: ProfileTopic[] = ['memory', 'attention', 'logic', 'math', 'speed', 'colors', 'words', 'differences']

export const POINTS_PER_LEVEL: Record<Level, number> = { 1: 10, 2: 20, 3: 35 }
export const FAST_BONUS_POINTS = 5
export const FAST_BONUS_XP = 5
export const PERFECT_SERIES_POINTS = 50

const emptyProfile = (): GameProfile => ({ points: 0, solved: 0, total: 0, bestCombo: 0, fast: 0, kinds: {} })

const KEY = 'neyronych_games_v1'

export function loadGameProfiles(): GameProfiles {
  const out = {} as GameProfiles
  for (const t of PROFILE_TOPICS) out[t] = emptyProfile()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const data = JSON.parse(raw)
      for (const t of PROFILE_TOPICS) {
        const p = data?.[t]
        if (p && typeof p === 'object') {
          out[t] = {
            points: Number(p.points) || 0,
            solved: Number(p.solved) || 0,
            total: Number(p.total) || 0,
            bestCombo: Number(p.bestCombo) || 0,
            fast: Number(p.fast) || 0,
            kinds: p.kinds && typeof p.kinds === 'object' ? p.kinds : {},
          }
        }
      }
    }
  } catch { /* localStorage может быть недоступен */ }
  return out
}

export function saveGameProfiles(p: GameProfiles): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export function recordGameResult(p: GameProfile, kind: string, ok: boolean, fast: boolean, points: number, combo: number): GameProfile {
  const prev = p.kinds[kind] || { t: 0, c: 0 }
  return {
    points: p.points + points,
    solved: p.solved + (ok ? 1 : 0),
    total: p.total + 1,
    bestCombo: Math.max(p.bestCombo, combo),
    fast: p.fast + (ok && fast ? 1 : 0),
    kinds: { ...p.kinds, [kind]: { t: prev.t + 1, c: prev.c + (ok ? 1 : 0) } },
  }
}

// ───────── Комбо ─────────

export function comboBonusXp(combo: number): number {
  if (combo >= 12) return 8
  if (combo >= 8) return 6
  if (combo >= 5) return 4
  if (combo >= 3) return 2
  return 0
}

// ───────── Ранги ─────────

export const RANK_THRESHOLDS = [0, 100, 300, 700, 1400, 2600]

export type Rank = { name: string; emoji: string }

export const TOPIC_RANKS: Record<ProfileTopic, Rank[]> = {
  memory: [
    { name: 'Золотая рыбка', emoji: '🐠' }, { name: 'Заучка', emoji: '📚' }, { name: 'Мнемонист', emoji: '🧩' },
    { name: 'Слон', emoji: '🐘' }, { name: 'Архивариус', emoji: '🗄️' }, { name: 'Хранитель времён', emoji: '🏛️' },
  ],
  attention: [
    { name: 'Зевака', emoji: '🥱' }, { name: 'Наблюдатель', emoji: '👀' }, { name: 'Следопыт', emoji: '🐾' },
    { name: 'Снайпер', emoji: '🎯' }, { name: 'Ястреб', emoji: '🦅' }, { name: 'Всевидящее око', emoji: '🔮' },
  ],
  logic: [
    { name: 'Стажёр', emoji: '🧩' }, { name: 'Загадочник', emoji: '🤔' }, { name: 'Аналитик', emoji: '📊' },
    { name: 'Детектив', emoji: '🕵️' }, { name: 'Шахматист', emoji: '♟️' }, { name: 'Гроссмейстер', emoji: '👑' },
  ],
  math: [
    { name: 'Счётовод', emoji: '➕' }, { name: 'Арифмометр', emoji: '🧮' }, { name: 'Математик', emoji: '📐' },
    { name: 'Вундеркинд', emoji: '🚀' }, { name: 'Профессор', emoji: '🎓' }, { name: 'Пифагор', emoji: '🔺' },
  ],
  speed: [
    { name: 'Черепаха', emoji: '🐢' }, { name: 'Заяц', emoji: '🐇' }, { name: 'Гепард', emoji: '🐆' },
    { name: 'Молния', emoji: '⚡' }, { name: 'Ракета', emoji: '🚀' }, { name: 'Скорость света', emoji: '💫' },
  ],
  colors: [
    { name: 'Серый мышонок', emoji: '🐭' }, { name: 'Художник', emoji: '🎨' }, { name: 'Колорист', emoji: '🖌️' },
    { name: 'Радуга', emoji: '🌈' }, { name: 'Хамелеон', emoji: '🦎' }, { name: 'Мастер спектра', emoji: '🔮' },
  ],
  words: [
    { name: 'Молчун', emoji: '🤐' }, { name: 'Болтун', emoji: '💬' }, { name: 'Грамотей', emoji: '✏️' },
    { name: 'Словесник', emoji: '📖' }, { name: 'Лингвист', emoji: '🔤' }, { name: 'Толковый словарь', emoji: '📚' },
  ],
  differences: [
    { name: 'Крот', emoji: '🐭' }, { name: 'Зоркий', emoji: '👀' }, { name: 'Сыщик', emoji: '🔍' },
    { name: 'Шерлок', emoji: '🕵️' }, { name: 'Орёл', emoji: '🦅' }, { name: 'Соколиный глаз', emoji: '🎯' },
  ],
}

export type RankInfo = { rank: Rank; index: number; next: Rank | null; progressPct: number; toNext: number }

export function getGameRank(topic: ProfileTopic, points: number): RankInfo {
  let idx = 0
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) if (points >= RANK_THRESHOLDS[i]) idx = i
  const ranks = TOPIC_RANKS[topic]
  const rank = ranks[idx]
  const next = ranks[idx + 1] ?? null
  if (!next) return { rank, index: idx, next: null, progressPct: 100, toNext: 0 }
  const lo = RANK_THRESHOLDS[idx]
  const hi = RANK_THRESHOLDS[idx + 1]
  return { rank, index: idx, next, progressPct: Math.round(((points - lo) / (hi - lo)) * 100), toNext: hi - points }
}

export function kindTitle(topic: ProfileTopic, kind: string): string {
  return topic === 'differences' ? 'Поиск отличий' : gameKindLabel(topic, kind)
}

export function analyzeGame(topic: ProfileTopic, p: GameProfile): { best: { label: string; pct: number } | null; worst: { label: string; pct: number } | null } {
  const rows = Object.entries(p.kinds)
    .filter(([, v]) => v && v.t >= 3)
    .map(([k, v]) => ({ label: kindTitle(topic, k), pct: Math.round((v.c / v.t) * 100), t: v.t }))
  if (rows.length === 0) return { best: null, worst: null }
  const sorted = [...rows].sort((a, b) => b.pct - a.pct || b.t - a.t)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  return {
    best: { label: best.label, pct: best.pct },
    worst: worst.label !== best.label && worst.pct < 80 ? { label: worst.label, pct: worst.pct } : null,
  }
}
import { Component, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Brain3D from './Brain3D'
import { generateMatrix, loadMatrixProfile, saveMatrixProfile, recordMatrixResult, getRank, analyzeProfile, kindLabel, PERFECT_SERIES_POINTS, FAST_BONUS_XP } from './matrices'
import type { MatrixProfile } from './matrices'
import { generateReading, loadReadingProfile, saveReadingProfile, recordReadingResult, averageWpm, getSpeedTier, readingKindLabel, analyzeReading, BONUS_XP as READING_BONUS_XP } from './reading'
import type { ReadingProfile, ReadingTask } from './reading'
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, evaluateAchievements, loadMeta, saveMeta, loadSeenAchievements, saveSeenAchievements } from './achievements'
import type { AchievementState, Meta } from './achievements'

declare global {
  interface Window {
    Telegram: any
  }
}

type Screen = 'welcome' | 'warmup' | 'warmupResult' | 'topic' | 'difficulty' | 'task' | 'summary' | 'stats' | 'achievements' | 'leaderboard' | 'paywall' | 'premiumPurchase' | 'invite'
type Topic = 'memory' | 'attention' | 'logic' | 'math' | 'differences' | 'speed' | 'colors' | 'words' | 'matrices' | 'reading'
type Difficulty = 1 | 2 | 3
type Background = 'space' | 'black' | 'white' | 'aurora' | 'neural' | 'ocean' | 'sunset'
type Lang = 'ru' | 'en'

type Task = {
  task_id: number | string
  question: string
  options: string[]
  correct?: string
  explanation?: string
  timeLimit?: number
  isColorTask?: boolean
  colorHex?: string
  passage?: string
  cells?: string[]
  cols?: number
  kind?: string
  kindLabel?: string
  level?: Difficulty
  xp?: number
  fastSeconds?: number
}
type SeriesEntry = { ok: boolean; ms: number; kind?: string; wpm?: number }
type ReadPhase = 'intro' | 'show' | 'question'
type AnswerResult = { is_correct: boolean; correct_answer: string; explanation: string; xp_earned: number }
type UserStats = {
  current_streak: number
  longest_streak: number
  total_xp: number
  level: number
  xp_into_level: number
  xp_for_next_level: number
  total: number
  correct: number
  by_category: { category: string; total: number; correct: number }[]
}
type AccessStatus = {
  trial_active: boolean
  trial_seconds_left: number
  subscription_active: boolean
  owns_premium_topics: boolean
}
type ReferralStats = { referrals_count: number; days_earned: number; pending_count: number }

type LeaderboardEntry = { user_id: number; username: string | null; total_xp: number; current_streak: number }
type LeaderboardData = { top: LeaderboardEntry[]; my_rank: number | null }

const TOPIC_KEYS: Topic[] = ['memory', 'attention', 'logic', 'math', 'differences', 'speed', 'colors', 'words']
const PREMIUM_TOPIC_KEYS: Topic[] = ['matrices', 'reading']
const CLIENT_TOPICS: Topic[] = ['differences', 'speed', 'colors', 'words', 'matrices', 'reading']
const DIFFICULTY_KEYS: Difficulty[] = [1, 2, 3]
const TOPIC_EMOJI: Record<Topic, string> = {
  memory: '🧠', attention: '👁', logic: '🧩', math: '🔢',
  differences: '🔍', speed: '⚡', colors: '🎨', words: '🔤',
  matrices: '🔲', reading: '📖',
}
const DIFFICULTY_EMOJI: Record<Difficulty, string> = { 1: '🟢', 2: '🟡', 3: '🔴' }
const BACKGROUNDS: { id: Background; icon: string; name: { ru: string; en: string }; swatch: string }[] = [
  { id: 'space', icon: '🌌', name: { ru: 'Космос', en: 'Space' }, swatch: 'radial-gradient(circle at 30% 30%, #34348a, #0a0a12 70%)' },
  { id: 'black', icon: '⚫', name: { ru: 'Чёрный', en: 'Black' }, swatch: '#0a0a12' },
  { id: 'white', icon: '⚪', name: { ru: 'Белый', en: 'White' }, swatch: '#ffffff' },
  { id: 'aurora', icon: '🌠', name: { ru: 'Северное сияние', en: 'Aurora' }, swatch: 'linear-gradient(135deg, #062a3a, #1fd39a 50%, #7a5cff)' },
  { id: 'neural', icon: '🕸️', name: { ru: 'Нейросеть', en: 'Neural net' }, swatch: 'radial-gradient(circle at 50% 40%, #4d4dff, #070718 75%)' },
  { id: 'ocean', icon: '🌊', name: { ru: 'Океан', en: 'Ocean' }, swatch: 'linear-gradient(180deg, #2a9fd6, #04304f 55%, #010b1c)' },
  { id: 'sunset', icon: '🌆', name: { ru: 'Закат', en: 'Synthwave' }, swatch: 'linear-gradient(180deg, #2a0a4d, #c2307a 55%, #ffb36b)' },
]
const SERIES_LENGTH = 5

const API_URL = 'https://neyronych-app.onrender.com'

type WarmupQuestion = { question: { ru: string; en: string }; options: string[]; correct: string }

function makeWarmupOptions(correct: number): string[] {
  const set = new Set<number>([correct])
  while (set.size < 4) {
    const v = correct + rand(1, 10) * (Math.random() < 0.5 ? -1 : 1)
    if (v > 0) set.add(v)
  }
  return shuffleArray(Array.from(set).map(String))
}

function generateWarmupMath(): WarmupQuestion {
  let text: string
  let correct: number
  if (rand(0, 1) === 0) {
    const a = rand(12, 19), b = rand(3, 9)
    text = `${a} × ${b} = ?`
    correct = a * b
  } else {
    const a = rand(30, 90), b = rand(11, 29), c = rand(5, 19)
    text = `${a} + ${b} − ${c} = ?`
    correct = a + b - c
  }
  return { question: { ru: text, en: text }, options: makeWarmupOptions(correct), correct: String(correct) }
}

function generateWarmupSequence(): WarmupQuestion {
  const type = rand(0, 2)
  let seq: number[]
  if (type === 0) {
    const start = rand(2, 20), step = rand(2, 9)
    seq = Array.from({ length: 7 }, (_, i) => start + step * i)
  } else if (type === 1) {
    const start = rand(1, 4), mult = rand(2, 3)
    seq = Array.from({ length: 6 }, (_, i) => start * mult ** i)
  } else {
    seq = [rand(1, 3), rand(1, 4)]
    while (seq.length < 7) seq.push(seq[seq.length - 1] + seq[seq.length - 2])
  }
  const correct = seq[seq.length - 1]
  const shown = seq.slice(0, -1).join(', ')
  return {
    question: { ru: `Продолжи: ${shown}, ?`, en: `Continue: ${shown}, ?` },
    options: makeWarmupOptions(correct),
    correct: String(correct),
  }
}

function generateWarmupQuestions(): WarmupQuestion[] {
  return [generateWarmupMath(), generateWarmupSequence()]
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateSpeedTask(difficulty: Difficulty): Task {
  let a: number, b: number, timeLimit: number
  if (difficulty === 1) { a = rand(2, 9); b = rand(2, 9); timeLimit = 8 }
  else if (difficulty === 2) { a = rand(10, 30); b = rand(2, 9); timeLimit = 6 }
  else { a = rand(11, 30); b = rand(11, 30); timeLimit = 5 }
  const correct = a * b
  const wrongPool = shuffleArray([correct + rand(1, 9), correct - rand(1, 9), correct + rand(10, 25)])
  const options = shuffleArray([String(correct), ...wrongPool.map(String)])
  return { task_id: 'speed-' + Date.now(), question: `${a} × ${b} = ?`, options, correct: String(correct), explanation: `${a} × ${b} = ${correct}`, timeLimit }
}

const COLOR_WORDS = [
  { name: { ru: 'Красный', en: 'Red' }, hex: '#EF4444' },
  { name: { ru: 'Синий', en: 'Blue' }, hex: '#3B82F6' },
  { name: { ru: 'Зелёный', en: 'Green' }, hex: '#22C55E' },
  { name: { ru: 'Жёлтый', en: 'Yellow' }, hex: '#EAB308' },
]

function generateColorsTask(difficulty: Difficulty, lang: Lang): Task {
  const wordObj = COLOR_WORDS[rand(0, COLOR_WORDS.length - 1)]
  let colorObj = COLOR_WORDS[rand(0, COLOR_WORDS.length - 1)]
  while (colorObj.name.ru === wordObj.name.ru) colorObj = COLOR_WORDS[rand(0, COLOR_WORDS.length - 1)]
  const timeLimit = difficulty === 1 ? 8 : difficulty === 2 ? 6 : 4
  const options = shuffleArray(COLOR_WORDS.map(c => c.name[lang]))
  return {
    task_id: 'color-' + Date.now(),
    question: wordObj.name[lang], options, correct: colorObj.name[lang],
    explanation: lang === 'ru' ? `Слово написано ${colorObj.name.ru.toLowerCase()} цветом` : `The word is rendered in ${colorObj.name.en.toLowerCase()}`,
    timeLimit, isColorTask: true, colorHex: colorObj.hex,
  }
}

const WORD_BANK: Record<Difficulty, string[]> = {
  1: ['корзина', 'дорога', 'салфетка', 'котёнок', 'подушка', 'ромашка'],
  2: ['библиотека', 'автомобиль', 'коллекция', 'ландшафт', 'учреждение', 'впечатление'],
  3: ['приключение', 'удивительный', 'путешествие', 'воображение', 'самостоятельный', 'преодоление'],
}

function similarDecoy(word: string, existing: string[]): string {
  let attempt = word
  let tries = 0
  do {
    const arr = word.split('')
    const i1 = rand(0, arr.length - 1)
    let i2 = rand(0, arr.length - 1)
    while (i2 === i1) i2 = rand(0, arr.length - 1)
    ;[arr[i1], arr[i2]] = [arr[i2], arr[i1]]
    attempt = arr.join('')
    tries++
  } while ((attempt === word || existing.includes(attempt)) && tries < 20)
  return attempt
}

function generateWordsTask(difficulty: Difficulty): Task {
  const words = WORD_BANK[difficulty]
  const word = words[rand(0, words.length - 1)]
  const scrambled = shuffleArray(word.split('')).join('')
  const decoys: string[] = []
  while (decoys.length < 3) decoys.push(similarDecoy(word, decoys))
  const options = shuffleArray([word, ...decoys])
  return { task_id: 'word-' + Date.now(), question: `Собери слово: ${scrambled.toUpperCase()}`, options, correct: word, explanation: `Слово: ${word}` }
}

type DiffBoard = { size: number; diffCount: number; cells: string[]; diffPositions: Set<number> }

function generateDifferencesBoard(difficulty: Difficulty): DiffBoard {
  const size = difficulty === 1 ? 8 : difficulty === 2 ? 10 : 12
  const diffCount = difficulty === 1 ? 5 : difficulty === 2 ? 10 : 15
  const totalCells = size * size
  const pairs: [string, string][] = [
    ['🔵', '🔷'], ['🟢', '🟩'], ['🔴', '🔶'], ['🟡', '🟨'], ['🟣', '🟪'],
  ]
  const [base, diff] = pairs[rand(0, pairs.length - 1)]
  const positions = new Set<number>()
  while (positions.size < diffCount) positions.add(rand(0, totalCells - 1))
  const cells = Array.from({ length: totalCells }, (_, i) => (positions.has(i) ? diff : base))
  return { size, diffCount, cells, diffPositions: positions }
}

function generateMatricesTask(difficulty: Difficulty): Task {
  const p = generateMatrix(difficulty)
  return {
    task_id: 'matrix-' + Date.now(), question: p.question, options: p.options, correct: p.correct, explanation: p.explanation,
    cells: p.cells, cols: p.cols, kind: p.kind, kindLabel: p.kindLabel, level: difficulty, xp: p.xp, fastSeconds: p.fastSeconds,
  }
}

function cellFontSize(text: string, cols: number): string {
  if (text === '?') return '1.4rem'
  if (/^-?\d+$/.test(text)) return text.length > 3 ? '1rem' : '1.2rem'
  const longest = Math.max(...text.replace(/\uFE0F/g, '').split('\n').map((l) => [...l].length))
  let size = longest <= 2 ? 1.6 : longest === 3 ? 1.35 : longest <= 5 ? 1.05 : 0.9
  if (cols >= 6) size = Math.min(size, 1.2)
  return `${size}rem`
}

const I18N = {
  ru: {
    welcomeTitle: 'Приветствую, мой мозговитый друг',
    welcomeSubtitle: 'Прокачаемся?',
    start: 'Начать',
    appName: 'Нейроныч',
    chooseTopic: 'Выбери тему',
    chooseDifficulty: 'Выбери сложность',
    back: '← Назад',
    nextTask: 'Ещё задание →',
    seriesDone: 'серия завершена',
    correctOf: 'правильно',
    continueBtn: 'Продолжить',
    stats: 'Статистика',
    currentStreak: 'Текущий стрик',
    bestStreak: 'Лучший стрик',
    total: 'Всего',
    warmupTitle: 'Разминка',
    warmupSubtitle: 'Пара вопросов, чтобы понять твой уровень',
    warmupResultTitle: 'Твой уровень',
    warmupLevels: { 1: 'Лёгкий 🟢', 2: 'Средний 🟡', 3: 'Сложный 🔴' } as Record<Difficulty, string>,
    topics: { memory: 'Память', attention: 'Внимание', logic: 'Логика', math: 'Счёт', differences: 'Отличия', speed: 'Скорость', colors: 'Цвета', words: 'Слова', matrices: 'Матрицы', reading: 'Скорочтение' } as Record<Topic, string>,
    difficulties: { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' } as Record<Difficulty, string>,
    level: 'Уровень',
    xpTotal: 'Всего XP',
    achievements: 'Достижения',
    leaderboard: 'Рейтинг',
    yourRank: 'Твоё место',
    anonymousPlayer: 'Игрок',
    found: 'Найдено',
    allFound: 'Все отличия найдены!',
    colorInstruction: 'Выбери цвет, которым НАПИСАНО слово (не то, что оно означает)',
    timeLeftLabel: 'Осталось',
    loadError: 'Не удалось загрузить задание',
    retryBtn: 'Повторить',
    memorizeHint: 'Запоминай — вопрос появится через пару секунд',
    trialLabel: 'Пробный период',
    subscribed: 'Подписка активна ✅',
    trialOverTitle: 'Пробный период закончился',
    trialOverSubtitle: 'Оформи подписку, чтобы продолжить тренировки',
    payWithStars: 'Оплатить Stars',
    payWithCrypto: 'Оплатить криптой',
    premiumLockedNoSub: 'Доступно по подписке',
    premiumBuyTitle: 'Открой премиум-темы',
    premiumBuySubtitle: 'Матрицы и Скорочтение — разово и навсегда',
    creatingInvoice: 'Создаём счёт...',
    passageHiddenHint: 'Читай внимательно — текст скоро исчезнет',
    inviteBtn: 'Пригласить друга',
    inviteTitle: 'Приглашай друзей',
    inviteSubtitle: 'Когда приглашённый друг дойдёт до 5 уровня — получишь 2 дня подписки',
    yourLink: 'Твоя ссылка',
    copyLink: 'Скопировать',
    copied: 'Скопировано!',
    referralsCount: 'Друзей пришло',
    daysEarned: 'Дней получено',
    pendingCount: 'В процессе',
  },
  en: {
    welcomeTitle: 'Hey there, my clever friend',
    welcomeSubtitle: 'Ready to train?',
    start: 'Start',
    appName: 'Neuronych',
    chooseTopic: 'Choose a topic',
    chooseDifficulty: 'Choose difficulty',
    back: '← Back',
    nextTask: 'Next task →',
    seriesDone: 'series complete',
    correctOf: 'correct',
    continueBtn: 'Continue',
    stats: 'Stats',
    currentStreak: 'Current streak',
    bestStreak: 'Best streak',
    total: 'Total',
    warmupTitle: 'Warm-up',
    warmupSubtitle: 'A couple of questions to gauge your level',
    warmupResultTitle: 'Your level',
    warmupLevels: { 1: 'Easy 🟢', 2: 'Medium 🟡', 3: 'Hard 🔴' } as Record<Difficulty, string>,
    topics: { memory: 'Memory', attention: 'Attention', logic: 'Logic', math: 'Math', differences: 'Differences', speed: 'Speed', colors: 'Colors', words: 'Words', matrices: 'Matrices', reading: 'Speed reading' } as Record<Topic, string>,
    difficulties: { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as Record<Difficulty, string>,
    level: 'Level',
    xpTotal: 'Total XP',
    achievements: 'Achievements',
    leaderboard: 'Leaderboard',
    yourRank: 'Your rank',
    anonymousPlayer: 'Player',
    found: 'Found',
    allFound: 'All differences found!',
    colorInstruction: 'Pick the color the word is WRITTEN in (not what it says)',
    timeLeftLabel: 'Time left',
    loadError: 'Could not load the task',
    retryBtn: 'Retry',
    memorizeHint: 'Memorize — the question appears in a moment',
    trialLabel: 'Trial',
    subscribed: 'Subscription active ✅',
    trialOverTitle: 'Your trial has ended',
    trialOverSubtitle: 'Subscribe to keep training',
    payWithStars: 'Pay with Stars',
    payWithCrypto: 'Pay with crypto',
    premiumLockedNoSub: 'Requires subscription',
    premiumBuyTitle: 'Unlock premium topics',
    premiumBuySubtitle: 'Matrices and Speed reading — one-time, forever',
    creatingInvoice: 'Creating invoice...',
    passageHiddenHint: 'Read carefully — the text disappears soon',
    inviteBtn: 'Invite a friend',
    inviteTitle: 'Invite your friends',
    inviteSubtitle: 'When your invited friend reaches level 5, you get 2 subscription days',
    yourLink: 'Your link',
    copyLink: 'Copy',
    copied: 'Copied!',
    referralsCount: 'Friends joined',
    daysEarned: 'Days earned',
    pendingCount: 'In progress',
  },
}

const PALETTES = {
  dark: {
    bg: '#0a0a12',
    text: '#ffffff',
    textSecondary: '#8a8aa0',
    cardBg: 'rgba(255,255,255,0.04)',
    cardBorder: 'rgba(255,255,255,0.12)',
    skeletonBg: 'rgba(255,255,255,0.06)',
  },
  light: {
    bg: '#ffffff',
    text: '#0a0a12',
    textSecondary: '#6b6b80',
    cardBg: 'rgba(10,10,18,0.03)',
    cardBorder: 'rgba(10,10,18,0.1)',
    skeletonBg: 'rgba(10,10,18,0.06)',
  },
}

const NEON = '#4D4DFF'
const GREEN = '#22C55E'
const RED = '#EF4444'
const GOLD = '#FFC850'

function Skeleton({ height, width, bg, style }: { height: string; width: string; bg: string; style?: React.CSSProperties }) {
  return <div className="skeleton-pulse" style={{ height, width, borderRadius: '12px', background: bg, ...style }} />
}

function StarField() {
  const stars = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 3,
  }))
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {stars.map((s) => (
        <div key={s.id} className="star-twinkle" style={{
          position: 'absolute', top: `${s.top}%`, left: `${s.left}%`, width: `${s.size}px`, height: `${s.size}px`,
          borderRadius: '50%', background: '#fff', animationDelay: `${s.delay}s`,
        }} />
      ))}
    </div>
  )
}

function CelebrateFX({ xp }: { xp: number }) {
  const colors = ['#4D4DFF', '#22C55E', '#FFC850', '#EF4444', '#3B82F6']
  const dots = Array.from({ length: 14 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 14
    const dist = 50 + Math.random() * 30
    return {
      id: i,
      color: colors[i % colors.length],
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      delay: Math.random() * 0.1,
    }
  })
  return (
    <div style={{ position: 'relative', height: 0 }}>
      <div style={{ position: 'absolute', left: '50%', top: '-20px', transform: 'translateX(-50%)' }}>
        {dots.map((d) => (
          <span key={d.id} className="confetti-dot" style={{ background: d.color, left: 0, top: 0, animationDelay: `${d.delay}s`, ['--dx' as any]: `${d.dx}px`, ['--dy' as any]: `${d.dy}px` }} />
        ))}
        <div className="xp-fly" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', color: '#FFC850', fontWeight: 700, fontSize: '1.1rem', whiteSpace: 'nowrap' }}>+{xp} XP</div>
      </div>
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.error('App crashed:', err) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a12', color: '#fff', fontFamily: '-apple-system, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧠💥</div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 500, margin: '0 0 0.5rem' }}>Что-то пошло не так</h1>
        <p style={{ color: '#8a8aa0', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>Something went wrong. Твой прогресс сохранён.</p>
        <button style={{ background: NEON, border: 'none', borderRadius: '14px', padding: '0.85rem 1.5rem', color: '#fff', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer' }} onClick={() => window.location.reload()}>Перезапустить</button>
      </div>
    )
  }
}

function isStats(d: unknown): d is UserStats {
  const x = d as UserStats | null
  return !!x && typeof x.total_xp === 'number' && typeof x.level === 'number' && Array.isArray(x.by_category)
}

// ───────── Фоны ─────────

const BG_BASE: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }

function AuroraBg() {
  return (
    <div style={{ ...BG_BASE, background: 'linear-gradient(180deg, #030a18 0%, #06162a 55%, #04101f 100%)' }}>
      <div className="bg-blob bg-a1" />
      <div className="bg-blob bg-a2" />
      <div className="bg-blob bg-a3" />
    </div>
  )
}

function OceanBg() {
  const [bubbles] = useState(() => Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 6 + Math.random() * 16,
    dur: 9 + Math.random() * 10,
    delay: -Math.random() * 18,
    sway: (Math.random() - 0.5) * 60,
  })))
  return (
    <div style={{ ...BG_BASE, background: 'linear-gradient(180deg, #05507a 0%, #033659 32%, #021d38 65%, #010b1c 100%)' }}>
      <div className="bg-ray" style={{ left: '8%', animationDelay: '0s' }} />
      <div className="bg-ray" style={{ left: '38%', width: '30vw', animationDelay: '-3s' }} />
      <div className="bg-ray" style={{ left: '72%', animationDelay: '-6s' }} />
      {bubbles.map((b) => (
        <span key={b.id} className="bg-bubble" style={{ left: `${b.left}%`, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`, ['--sway' as any]: `${b.sway}px` }} />
      ))}
    </div>
  )
}

function SunsetBg() {
  return (
    <div style={{ ...BG_BASE, background: 'linear-gradient(180deg, #12002b 0%, #3b0a5c 34%, #a3206b 58%, #ff6a5c 78%, #ffb36b 100%)' }}>
      <div className="bg-sun" />
      <div className="bg-floor" />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,0,24,0.5), rgba(8,0,24,0.15) 55%, rgba(8,0,24,0.45))' }} />
    </div>
  )
}

function NeuralBg() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = ctx
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0, last = 0, nextPulse = 0
    const nodes = Array.from({ length: 48 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00006, vy: (Math.random() - 0.5) * 0.00006,
      r: 1.3 + Math.random() * 1.9, gold: Math.random() < 0.2,
    }))
    const pulses: { a: number; b: number; t: number }[] = []
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const frame = (time: number) => {
      const dt = Math.min(50, time - (last || time))
      last = time
      const link = Math.max(95, Math.min(150, Math.min(w, h) * 0.3))
      g.clearRect(0, 0, w, h)
      for (const n of nodes) {
        n.x += n.vx * dt * (h / 700); n.y += n.vy * dt * (h / 700)
        if (n.x < 0 || n.x > 1) n.vx *= -1
        if (n.y < 0 || n.y > 1) n.vy *= -1
      }
      const near: number[][] = nodes.map(() => [])
      g.lineWidth = 1
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[i].x - nodes[j].x) * w, dy = (nodes[i].y - nodes[j].y) * h
          const d = Math.hypot(dx, dy)
          if (d < link) {
            near[i].push(j); near[j].push(i)
            g.strokeStyle = `rgba(120,130,255,${(1 - d / link) * 0.4})`
            g.beginPath(); g.moveTo(nodes[i].x * w, nodes[i].y * h); g.lineTo(nodes[j].x * w, nodes[j].y * h); g.stroke()
          }
        }
      }
      if (!reduce && time > nextPulse && pulses.length < 7) {
        nextPulse = time + 350
        const a = Math.floor(Math.random() * nodes.length)
        if (near[a].length) pulses.push({ a, b: near[a][Math.floor(Math.random() * near[a].length)], t: 0 })
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k]
        p.t += dt / 900
        if (p.t >= 1) { pulses.splice(k, 1); continue }
        const x = (nodes[p.a].x + (nodes[p.b].x - nodes[p.a].x) * p.t) * w
        const y = (nodes[p.a].y + (nodes[p.b].y - nodes[p.a].y) * p.t) * h
        g.fillStyle = 'rgba(255,215,120,0.25)'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill()
        g.fillStyle = 'rgba(255,235,170,0.95)'; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill()
      }
      nodes.forEach((n, i) => {
        const r = n.r * (1 + 0.25 * Math.sin(time / 700 + i))
        g.fillStyle = n.gold ? 'rgba(255,200,80,0.18)' : 'rgba(120,130,255,0.18)'
        g.beginPath(); g.arc(n.x * w, n.y * h, r * 3, 0, Math.PI * 2); g.fill()
        g.fillStyle = n.gold ? 'rgba(255,200,80,0.95)' : 'rgba(170,175,255,0.95)'
        g.beginPath(); g.arc(n.x * w, n.y * h, r, 0, Math.PI * 2); g.fill()
      })
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} style={{ ...BG_BASE, width: '100%', height: '100%', background: 'radial-gradient(circle at 50% 30%, #12124a 0%, #070718 60%, #03030a 100%)' }} />
}

function BackgroundLayer({ kind }: { kind: Background }) {
  if (kind === 'aurora') return <AuroraBg />
  if (kind === 'ocean') return <OceanBg />
  if (kind === 'sunset') return <SunsetBg />
  if (kind === 'neural') return <NeuralBg />
  return null
}

function formatTrialTime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  if (days > 0) return `${days}д ${hours}ч`
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}ч ${minutes}м`
  const seconds = totalSeconds % 60
  return `${minutes}м ${seconds}с`
}

function AppInner() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [prevScreen, setPrevScreen] = useState<Screen>('topic')
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [memoryHidden, setMemoryHidden] = useState(false)
  const [readTask, setReadTask] = useState<ReadingTask | null>(null)
  const [readPhase, setReadPhase] = useState<ReadPhase>('intro')
  const readStartRef = useRef<number>(0)
  const readWpmRef = useRef<number | null>(null)
  const seriesStartWpmRef = useRef<number>(0)
  const [readingProfile, setReadingProfile] = useState<ReadingProfile>(loadReadingProfile)
  const [meta, setMeta] = useState<Meta>(loadMeta)
  const [toastQueue, setToastQueue] = useState<string[]>([])
  const seenRef = useRef<string[] | null | undefined>(undefined)
  const [bgMenuOpen, setBgMenuOpen] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)
  const [seriesLog, setSeriesLog] = useState<SeriesEntry[]>([])
  const [matrixProfile, setMatrixProfile] = useState<MatrixProfile>(loadMatrixProfile)
  const taskStartRef = useRef<number>(Date.now())
  const seriesStartPointsRef = useRef<number>(0)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [diffFound, setDiffFound] = useState<number[]>([])
  const [diffBoard, setDiffBoard] = useState<DiffBoard | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [access, setAccess] = useState<AccessStatus | null>(null)
  const [payLoading, setPayLoading] = useState(false)
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const [background, setBackground] = useState<Background>(() => {
    const saved = localStorage.getItem('neyronych_background')
    return BACKGROUNDS.some((b) => b.id === saved) ? (saved as Background) : 'space'
  })
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('neyronych_lang')
    return saved === 'ru' || saved === 'en' ? saved : 'ru'
  })

  const [warmupStep, setWarmupStep] = useState(0)
  const [warmupCorrect, setWarmupCorrect] = useState(0)
  const [warmupLevel, setWarmupLevel] = useState<Difficulty>(2)
  const [warmupAnswered, setWarmupAnswered] = useState<string | null>(null)
  const [warmupQuestions] = useState<WarmupQuestion[]>(generateWarmupQuestions)

  const t = I18N[lang]
  const c = background === 'white' ? PALETTES.light : PALETTES.dark
  const bgMeta = BACKGROUNDS.find((b) => b.id === background) ?? BACKGROUNDS[0]

  useEffect(() => { localStorage.setItem('neyronych_background', background) }, [background])
  useEffect(() => { localStorage.setItem('neyronych_lang', lang) }, [lang])
  useEffect(() => { window.scrollTo(0, 0) }, [screen])

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) { tg.ready(); tg.expand() }
    const tgUser = tg?.initDataUnsafe?.user
    const uid = tgUser?.id ?? 0
    const uname = tgUser?.username ?? null
    setUserId(uid)

    const startParam: string | undefined = tg?.initDataUnsafe?.start_param
    let referrerId: number | null = null
    if (startParam && startParam.startsWith('ref_')) {
      const parsed = parseInt(startParam.slice(4), 10)
      if (!isNaN(parsed)) referrerId = parsed
    }

    fetch(`${API_URL}/api/user/init`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, username: uname, referrer_id: referrerId }),
    })
      .then(() => fetch(`${API_URL}/api/access/${uid}`))
      .then((res) => res.json())
      .then((data: AccessStatus) => setAccess(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!access || access.subscription_active || !access.trial_active) return
    const id = setInterval(() => {
      setAccess((prev) => {
        if (!prev) return prev
        const left = prev.trial_seconds_left - 1
        if (left <= 0) return { ...prev, trial_seconds_left: 0, trial_active: false }
        return { ...prev, trial_seconds_left: left }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [access?.trial_active, access?.subscription_active])

  const haptic = (type: 'success' | 'error') => {
    const tg = window.Telegram?.WebApp
    tg?.HapticFeedback?.notificationOccurred(type)
  }

  const openInvite = () => {
    setScreen('invite')
    setLinkCopied(false)
    const uid = userId ?? 0
    fetch(`${API_URL}/api/referrals/${uid}`).then((res) => res.json()).then((data: ReferralStats) => setReferralStats(data)).catch(() => {})
  }

  const referralLink = `https://t.me/neyronych18_bot/app?startapp=ref_${userId ?? 0}`

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }).catch(() => {})
  }

  const showMessage = (text: string) => {
    const tg = window.Telegram?.WebApp
    if (tg?.showAlert) tg.showAlert(text)
    else window.alert(text)
  }

  const refreshAccess = (uid: number) => {
    fetch(`${API_URL}/api/access/${uid}`).then((res) => res.json()).then((data: AccessStatus) => setAccess(data)).catch(() => {})
  }

  const openPayLink = (url?: string) => {
    const tg = window.Telegram?.WebApp
    if (!url) {
      showMessage(lang === 'ru' ? 'Не удалось создать счёт. Попробуй ещё раз чуть позже.' : 'Could not create the invoice. Please try again later.')
      return
    }
    if (url.includes('t.me/invoice') || url.includes('t.me/$')) {
      if (tg?.openInvoice) {
        tg.openInvoice(url, (status: string) => {
          if (status === 'paid') {
            setScreen('topic')
            if (userId !== null) {
              setTimeout(() => refreshAccess(userId), 2000)
              setTimeout(() => refreshAccess(userId), 6000)
            }
          } else if (status === 'failed') {
            showMessage(lang === 'ru' ? 'Оплата не прошла. Проверь баланс звёзд и попробуй ещё раз.' : 'Payment failed. Check your Stars balance and try again.')
          }
        })
      } else {
        window.open(url, '_blank')
      }
    } else {
      tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
    }
  }

  const paySubscription = (method: 'stars' | 'crypto') => {
    if (userId === null) return
    setPayLoading(true)
    fetch(`${API_URL}/api/pay/${method}/subscription`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
      .then((res) => res.json())
      .then((data) => { setPayLoading(false); openPayLink(data.invoice_link || data.pay_url) })
      .catch(() => { setPayLoading(false); openPayLink(undefined) })
  }

  const payPremium = (method: 'stars' | 'crypto') => {
    if (userId === null) return
    setPayLoading(true)
    fetch(`${API_URL}/api/pay/${method}/premium`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
      .then((res) => res.json())
      .then((data) => { setPayLoading(false); openPayLink(data.invoice_link || data.pay_url) })
      .catch(() => { setPayLoading(false); openPayLink(undefined) })
  }

  const resetSeries = () => {
    setSeriesLog([])
    seriesStartPointsRef.current = matrixProfile.points
    seriesStartWpmRef.current = averageWpm(readingProfile)
  }

  const loadTask = (topic: Topic, difficulty: Difficulty) => {
    taskStartRef.current = Date.now()
    setSelectedAnswer(null)
    setAnswerResult(null)
    setDiffFound([])
    setDiffBoard(null)
    setTimeLeft(null)
    setLoadError(false)
    setMemoryHidden(false)

    if (topic === 'differences') {
      const board = generateDifferencesBoard(difficulty)
      setDiffBoard(board)
      setTask({ task_id: 'diff-' + Date.now(), question: '', options: [] })
      setScreen('task')
      return
    }

    if (topic === 'reading') {
      const rt = generateReading(difficulty)
      readWpmRef.current = null
      setReadTask(rt)
      setReadPhase('intro')
      setTask({ task_id: 'reading-' + Date.now(), question: rt.question, options: shuffleArray(rt.options), correct: rt.correct, explanation: rt.explanation, kind: rt.kind, kindLabel: rt.kindLabel, level: difficulty, xp: rt.xp, fastSeconds: rt.fastSeconds })
      setScreen('task')
      return
    }

    if (CLIENT_TOPICS.includes(topic)) {
      let generated: Task
      if (topic === 'speed') generated = generateSpeedTask(difficulty)
      else if (topic === 'colors') generated = generateColorsTask(difficulty, lang)
      else if (topic === 'words') generated = generateWordsTask(difficulty)
      else generated = generateMatricesTask(difficulty)
      setTask({ ...generated, options: shuffleArray(generated.options) })
      setTimeLeft(generated.timeLimit || null)
      setScreen('task')
      return
    }

    setLoading(true)
    setScreen('task')
    fetch(`${API_URL}/api/task?category=${topic}&difficulty=${difficulty}`)
      .then((res) => { if (!res.ok) throw new Error('bad'); return res.json() })
      .then((data) => {
        setTask({ task_id: data.task_id, question: data.question, options: shuffleArray(JSON.parse(data.options)) })
        setLoading(false)
        if (topic === 'memory') setTimeout(() => setMemoryHidden(true), 3000)
      })
      .catch(() => { setLoading(false); setLoadError(true) })
  }

  useEffect(() => {
    if (timeLeft === null || answerResult || screen !== 'task') return
    if (timeLeft <= 0) { submitAnswer(''); return }
    const id = setTimeout(() => setTimeLeft((v) => (v !== null ? v - 1 : null)), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, answerResult, screen])

  // Скорочтение: текст / вспышка сами исчезают по таймеру и открывают вопрос
  useEffect(() => {
    if (screen !== 'task' || selectedTopic !== 'reading' || !readTask || readPhase !== 'show' || readTask.mode === 'scan') return
    const ms = readTask.mode === 'read' ? (readTask.readSeconds ?? 10) * 1000 : (readTask.showMs ?? 1500)
    const id = setTimeout(() => finishShow(false), ms)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedTopic, readTask, readPhase])

  const startReading = () => {
    if (!readTask) return
    readStartRef.current = Date.now()
    taskStartRef.current = Date.now()
    setReadPhase('show')
    if (readTask.mode === 'scan') setTimeLeft(readTask.timeLimit ?? 12)
  }

  const finishShow = (manual: boolean) => {
    if (!readTask) return
    if (readTask.mode === 'read') {
      const words = readTask.wordCount ?? 0
      const ms = manual ? Math.max(1000, Date.now() - readStartRef.current) : (readTask.readSeconds ?? 10) * 1000
      readWpmRef.current = Math.min(700, Math.round(words / (ms / 60000)))
    }
    taskStartRef.current = Date.now()
    setReadPhase('question')
  }

  const leaveTask = () => {
    setTimeLeft(null)
    setScreen('difficulty')
  }

  const submitAnswer = (opt: string) => {
    if (!task || !selectedTopic || selectedAnswer !== null) return
    setSelectedAnswer(opt)

    if (CLIENT_TOPICS.includes(selectedTopic)) {
      const isCorrect = opt === task.correct
      const elapsedMs = Date.now() - taskStartRef.current
      const isMatrix = selectedTopic === 'matrices' && !!task.kind && !!task.level
      const isReading = selectedTopic === 'reading' && !!readTask && !!task.kind && !!task.level
      let bonus = 0
      let note = ''
      let wpm: number | null = null
      if (isMatrix && isCorrect && elapsedMs <= (task.fastSeconds ?? 0) * 1000) {
        bonus = FAST_BONUS_XP
        note = `\n⚡ Быстрый ответ: +${FAST_BONUS_XP} XP`
      }
      if (isReading && readTask) {
        if (readTask.mode === 'read') {
          wpm = readWpmRef.current
          if (wpm !== null) {
            note = `\n📖 Скорость чтения: ${wpm} слов/мин`
            if (isCorrect && readTask.targetWpm && wpm >= readTask.targetWpm) {
              bonus = READING_BONUS_XP
              note += ` — выше цели (${readTask.targetWpm})! +${READING_BONUS_XP} XP`
            } else if (readTask.targetWpm) {
              note += ` (цель — ${readTask.targetWpm})`
            }
          }
        } else if (isCorrect && elapsedMs <= readTask.fastSeconds * 1000) {
          bonus = READING_BONUS_XP
          note = `\n⚡ Быстрый ответ: +${READING_BONUS_XP} XP`
        }
      }
      const xp = isCorrect ? (task.xp ?? 10) + bonus : 0
      const explanation = (task.explanation || '') + note
      const result: AnswerResult = { is_correct: isCorrect, correct_answer: task.correct || '', explanation, xp_earned: xp }
      setAnswerResult(result)
      haptic(isCorrect ? 'success' : 'error')
      setSeriesLog((prev) => [...prev, { ok: isCorrect, ms: elapsedMs, kind: task.kind, wpm: isCorrect && wpm !== null ? wpm : undefined }])
      if (isMatrix) {
        setMatrixProfile((prev) => {
          const next = recordMatrixResult(prev, task.kind as string, task.level as Difficulty, isCorrect, bonus > 0)
          saveMatrixProfile(next)
          return next
        })
      }
      if (isReading) {
        setReadingProfile((prev) => {
          const next = recordReadingResult(prev, task.kind as string, isCorrect, wpm)
          saveReadingProfile(next)
          return next
        })
      }
      if (userId !== null) {
        fetch(`${API_URL}/api/answer/client`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, category: selectedTopic, is_correct: isCorrect, xp_value: isCorrect ? xp : (task.xp ?? 10) }),
        }).then(() => { if (isCorrect) fetchTopBarStats(userId) }).catch(() => {})
      }
      return
    }

    const uid = userId ?? 0
    fetch(`${API_URL}/api/answer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, task_id: task.task_id, answer: opt }),
    })
      .then((res) => res.json())
      .then((data: AnswerResult) => {
        setAnswerResult(data)
        haptic(data.is_correct ? 'success' : 'error')
        setSeriesLog((prev) => [...prev, { ok: data.is_correct, ms: Date.now() - taskStartRef.current }])
        if (data.is_correct) fetchTopBarStats(uid)
      })
      .catch(() => setAnswerResult({ is_correct: false, correct_answer: '', explanation: t.loadError, xp_earned: 0 }))
  }

  const tapDiffCell = (index: number) => {
    if (!diffBoard || answerResult || !selectedTopic) return
    if (!diffBoard.diffPositions.has(index)) return
    if (diffFound.includes(index)) return
    const newFound = [...diffFound, index]
    setDiffFound(newFound)
    if (newFound.length === diffBoard.diffCount) {
      const xpValue = diffBoard.diffCount
      setAnswerResult({ is_correct: true, correct_answer: '', explanation: t.allFound, xp_earned: xpValue })
      haptic('success')
      setSeriesLog((prev) => [...prev, { ok: true, ms: Date.now() - taskStartRef.current }])
      if (userId !== null) {
        fetch(`${API_URL}/api/answer/client`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, category: 'differences', is_correct: true, xp_value: xpValue }),
        }).then(() => fetchTopBarStats(userId)).catch(() => {})
      }
    }
  }

  const handleNext = () => {
    if (!selectedTopic || !selectedDifficulty) return
    if (seriesLog.length >= SERIES_LENGTH) {
      if (seriesLog.every((e) => e.ok)) {
        if (selectedTopic === 'matrices') {
          const next = { ...matrixProfile, points: matrixProfile.points + PERFECT_SERIES_POINTS }
          setMatrixProfile(next)
          saveMatrixProfile(next)
        }
        const nextMeta = { ...meta, perfectSeries: meta.perfectSeries + 1 }
        setMeta(nextMeta)
        saveMeta(nextMeta)
      }
      setScreen('summary')
    } else loadTask(selectedTopic, selectedDifficulty)
  }

  const continueAfterSummary = () => {
    if (!selectedTopic || !selectedDifficulty) return
    resetSeries()
    loadTask(selectedTopic, selectedDifficulty)
  }

  const fetchTopBarStats = (uid: number) => {
    fetch(`${API_URL}/api/stats/${uid}`).then((res) => res.json()).then((data) => { if (isStats(data)) setUserStats(data) }).catch(() => {})
  }

  useEffect(() => {
    if (userId !== null) fetchTopBarStats(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const openStats = () => {
    const uid = userId ?? 0
    setPrevScreen(screen); setScreen('stats'); setStatsLoading(true)
    fetch(`${API_URL}/api/stats/${uid}`).then((res) => res.json()).then((data) => { if (isStats(data)) setUserStats(data); setStatsLoading(false) }).catch(() => setStatsLoading(false))
  }

  const openAchievements = () => {
    setScreen('achievements')
    if (userId !== null) fetchTopBarStats(userId)
  }

  const openLeaderboard = () => {
    setScreen('leaderboard'); setLeaderboardLoading(true)
    const uid = userId ?? 0
    fetch(`${API_URL}/api/leaderboard?user_id=${uid}`).then((res) => res.json()).then((data: LeaderboardData) => { if (data && Array.isArray(data.top)) setLeaderboardData(data); setLeaderboardLoading(false) }).catch(() => setLeaderboardLoading(false))
  }

  const answerWarmup = (opt: string) => {
    if (warmupAnswered !== null) return
    setWarmupAnswered(opt)
    const q = warmupQuestions[warmupStep]
    const isCorrect = opt === q.correct
    haptic(isCorrect ? 'success' : 'error')
    setWarmupCorrect(warmupCorrect + (isCorrect ? 1 : 0))
  }

  const proceedWarmup = () => {
    const newCorrect = warmupCorrect
    setWarmupAnswered(null)
    if (warmupStep + 1 < warmupQuestions.length) setWarmupStep(warmupStep + 1)
    else {
      const level: Difficulty = newCorrect === 0 ? 1 : newCorrect === 1 ? 2 : 3
      setWarmupLevel(level)
      setScreen('warmupResult')
    }
  }

  const s = getStyles(c)

  // Достижения считаются здесь, на телефоне — без запросов к серверу
  let achStates: AchievementState[] = []
  try {
    achStates = evaluateAchievements({ stats: userStats, matrix: matrixProfile, reading: readingProfile, meta })
  } catch { achStates = [] }
  const unlockedKey = achStates.filter((a) => a.unlocked).map((a) => a.def.id).join(',')
  const hasStats = userStats !== null

  useEffect(() => {
    if (!hasStats) return
    if (seenRef.current === undefined) seenRef.current = loadSeenAchievements()
    const ids = unlockedKey ? unlockedKey.split(',') : []
    const seen = seenRef.current
    if (seen === null || seen === undefined) {
      // первый запуск: то, что уже получено раньше, «новым» не считаем
      seenRef.current = ids
      saveSeenAchievements(ids)
      return
    }
    const fresh = ids.filter((id) => !seen.includes(id))
    if (fresh.length > 0) {
      seenRef.current = [...seen, ...fresh]
      saveSeenAchievements(seenRef.current)
      setToastQueue((q) => [...q, ...fresh])
      haptic('success')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedKey, hasStats])

  useEffect(() => {
    if (toastQueue.length === 0) return
    const id = setTimeout(() => setToastQueue((q) => q.slice(1)), 3800)
    return () => clearTimeout(id)
  }, [toastQueue])

  const toastDef = toastQueue.length > 0 ? ACHIEVEMENTS.find((a) => a.id === toastQueue[0]) : undefined

  const renderMatrixSummary = () => {
    const info = getRank(matrixProfile.points)
    const before = getRank(seriesStartPointsRef.current)
    const gained = matrixProfile.points - seriesStartPointsRef.current
    const rankedUp = info.rank.name !== before.rank.name
    const analysis = analyzeProfile(matrixProfile)
    return (
      <div style={s.statsWrap}>
        <div style={{ ...s.streakCard, marginBottom: '1rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{info.rank.emoji}</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 500 }}>Ранг: {info.rank.name}</div>
          {rankedUp && <div style={{ color: GREEN, fontSize: '0.85rem', marginTop: '0.25rem' }}>🎉 Новый ранг!</div>}
          <div style={{ ...s.levelBarTrack, margin: '0.75rem 0 0.4rem' }}><div style={{ ...s.levelBarFill, width: `${info.progressPct}%` }} /></div>
          <div style={{ fontSize: '0.78rem', color: c.textSecondary }}>
            {matrixProfile.points} очков{gained > 0 ? ` (+${gained} за серию)` : ''} · {info.next ? `до «${info.next.name}»: ${info.toNext}` : 'максимальный ранг'}
          </div>
        </div>
        <div style={{ ...s.categoryList, marginBottom: '1rem' }}>
          {seriesLog.map((e, i) => (
            <div key={i} style={s.categoryRow}>
              <span>{e.ok ? '✅' : '❌'} {e.kind ? kindLabel(e.kind) : ''}</span>
              <span style={{ color: c.textSecondary }}>{Math.max(1, Math.round(e.ms / 1000))} с</span>
            </div>
          ))}
        </div>
        {analysis.best && <p style={{ fontSize: '0.85rem', color: c.textSecondary, marginBottom: '0.4rem' }}>💪 Сильная сторона: {analysis.best.label} — {analysis.best.pct}%</p>}
        {analysis.worst && <p style={{ fontSize: '0.85rem', color: c.textSecondary, marginBottom: '0.4rem' }}>🎯 Стоит подтянуть: {analysis.worst.label} — {analysis.worst.pct}%</p>}
      </div>
    )
  }

  const seriesPerfect = seriesLog.length >= SERIES_LENGTH && seriesLog.every((e) => e.ok)

  const renderReadingSummary = () => {
    const avg = averageWpm(readingProfile)
    const info = getSpeedTier(avg)
    const startInfo = getSpeedTier(seriesStartWpmRef.current)
    const tierUp = avg > 0 && info.tier.min > startInfo.tier.min
    const wpms = seriesLog.filter((e) => e.wpm).map((e) => e.wpm as number)
    const seriesAvg = wpms.length ? Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length) : 0
    const analysis = analyzeReading(readingProfile)
    const need = Math.max(0, 3 - readingProfile.recent.length)
    return (
      <div style={s.statsWrap}>
        <div style={{ ...s.streakCard, marginBottom: '1rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{info.tier.emoji}</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 500 }}>Скорость чтения: {info.tier.name}</div>
          {tierUp && <div style={{ color: GREEN, fontSize: '0.85rem', marginTop: '0.25rem' }}>🎉 Новый уровень!</div>}
          <div style={{ fontSize: '1.7rem', fontWeight: 600, margin: '0.5rem 0 0.4rem' }}>{avg > 0 ? avg : '—'} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: c.textSecondary }}>слов/мин</span></div>
          <div style={{ ...s.levelBarTrack, margin: '0.5rem 0 0.4rem' }}><div style={{ ...s.levelBarFill, width: `${avg > 0 ? info.progressPct : 0}%` }} /></div>
          <div style={{ fontSize: '0.78rem', color: c.textSecondary }}>
            {avg > 0
              ? (info.next ? `до «${info.next.name}»: ещё ${info.toNext} слов/мин` : 'максимальный уровень')
              : `Прочитай ещё ${need} ${need === 1 ? 'текст' : 'текста'} — и я измерю твою скорость`}
          </div>
          {seriesAvg > 0 && <div style={{ fontSize: '0.78rem', color: c.textSecondary, marginTop: '0.4rem' }}>В этой серии: {seriesAvg} слов/мин</div>}
          {readingProfile.peakWpm > 0 && <div style={{ fontSize: '0.78rem', color: GOLD, marginTop: '0.25rem' }}>🏆 Рекорд: {readingProfile.peakWpm} слов/мин</div>}
        </div>
        <div style={{ ...s.categoryList, marginBottom: '1rem' }}>
          {seriesLog.map((e, i) => (
            <div key={i} style={s.categoryRow}>
              <span>{e.ok ? '✅' : '❌'} {e.kind ? readingKindLabel(e.kind) : ''}</span>
              <span style={{ color: c.textSecondary }}>{e.wpm ? `${e.wpm} сл/мин` : `${Math.max(1, Math.round(e.ms / 1000))} с`}</span>
            </div>
          ))}
        </div>
        {analysis.best && <p style={{ fontSize: '0.85rem', color: c.textSecondary, marginBottom: '0.4rem' }}>💪 Сильная сторона: {analysis.best.label} — {analysis.best.pct}%</p>}
        {analysis.worst && <p style={{ fontSize: '0.85rem', color: c.textSecondary, marginBottom: '0.4rem' }}>🎯 Стоит подтянуть: {analysis.worst.label} — {analysis.worst.pct}%</p>}
      </div>
    )
  }

  const renderReading = () => {
    if (!readTask || !task) return null
    const rt = readTask
    const step = Math.min(SERIES_LENGTH, answerResult ? seriesLog.length : seriesLog.length + 1)
    const badge = (
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', margin: '3rem 0 1.25rem', position: 'relative', zIndex: 1 }}>
        <span style={s.pill}>{rt.kindLabel}</span>
        <span style={s.pill}>{DIFFICULTY_EMOJI[rt.level]} {step}/{SERIES_LENGTH}</span>
      </div>
    )
    const resultBlock = answerResult && (
      <>
        {answerResult.is_correct && <CelebrateFX xp={answerResult.xp_earned} />}
        <p style={s.explanation}>{answerResult.explanation}</p>
        <button style={s.nextButton} onClick={handleNext}>{t.nextTask}</button>
      </>
    )

    if (readPhase === 'intro') {
      return (
        <>
          {badge}
          <div style={{ ...s.readCard, textAlign: 'center' }}>
            <p style={{ margin: 0, lineHeight: 1.55, fontSize: '0.95rem' }}>{rt.intro}</p>
            {rt.mode === 'read' && rt.targetWpm && (
              <p style={{ margin: '0.9rem 0 0', fontSize: '0.8rem', color: c.textSecondary }}>{rt.wordCount} слов · цель: {rt.targetWpm} слов/мин</p>
            )}
          </div>
          <button style={s.nextButton} onClick={startReading}>{lang === 'ru' ? 'Поехали' : 'Go'}</button>
        </>
      )
    }

    if (rt.mode === 'scan') {
      const cols = rt.cols ?? 4
      return (
        <>
          {badge}
          <p style={{ fontSize: '0.8rem', fontWeight: 500, margin: '0 0 0.5rem', minHeight: '1.1em', color: !answerResult && timeLeft !== null && timeLeft <= 3 ? RED : c.textSecondary }}>
            {!answerResult && timeLeft !== null ? `⏱ ${t.timeLeftLabel}: ${timeLeft}` : ''}
          </p>
          <p style={{ ...s.question, margin: '0 0 1rem' }}>{rt.question} <span style={{ color: c.textSecondary, fontSize: '0.8rem' }}>— {lang === 'ru' ? 'тапни по нему' : 'tap it'}</span></p>
          <div style={s.matrixGrid}>
            {(rt.words ?? []).map((w, i) => {
              const isDup = answerResult !== null && w === rt.correct
              const isWrongPick = answerResult !== null && selectedAnswer === w && w !== rt.correct
              let extra: React.CSSProperties = {}
              if (isDup) extra = { background: 'rgba(34, 197, 94, 0.18)', border: `0.5px solid ${GREEN}` }
              else if (isWrongPick) extra = { background: 'rgba(239, 68, 68, 0.18)', border: `0.5px solid ${RED}` }
              return (
                <button key={i} disabled={selectedAnswer !== null} onClick={() => submitAnswer(w)}
                  style={{ ...s.matrixCell, fontFamily: 'inherit', cursor: 'pointer', width: `calc(${100 / cols}% - 6px)`, fontSize: cols >= 4 ? '0.88rem' : '1rem', ...extra }}>{w}</button>
              )
            })}
          </div>
          {!answerResult && (
            <div style={s.timerTrack}>
              <div key={String(task.task_id)} style={{ ...s.timerFill, animation: `shrinkBar ${rt.timeLimit ?? 12}s linear forwards` }} />
            </div>
          )}
          {resultBlock}
        </>
      )
    }

    if (readPhase === 'show') {
      if (rt.mode === 'read') {
        return (
          <>
            {badge}
            <div style={{ ...s.readCard, textAlign: 'left', fontSize: '1.05rem', lineHeight: 1.7 }}>{rt.passage}</div>
            <div style={s.timerTrack}>
              <div key={String(task.task_id)} style={{ ...s.timerFill, animation: `shrinkBar ${rt.readSeconds ?? 10}s linear forwards` }} />
            </div>
            <button style={s.nextButton} onClick={() => finishShow(true)}>{lang === 'ru' ? 'Прочитал ✓' : 'Done reading ✓'}</button>
          </>
        )
      }
      const digits = rt.kind === 'digits'
      return (
        <>
          {badge}
          <div style={{ ...s.readCard, padding: '2.4rem 1rem', fontSize: digits ? '2.3rem' : '1.55rem', fontWeight: 600, letterSpacing: digits ? '0.06em' : 0, lineHeight: 1.4 }}>{rt.passage}</div>
        </>
      )
    }

    // вопрос (чтение и вспышки)
    return (
      <>
        {badge}
        <p style={{ fontSize: '0.78rem', color: c.textSecondary, margin: '0 0 0.6rem', position: 'relative', zIndex: 1 }}>{rt.mode === 'read' ? '📖 Текст скрыт' : '👁 Вспышка закончилась'}</p>
        <p style={s.question}>{rt.question}</p>
        <div style={s.gridAnswers}>
          {task.options.map((opt) => {
            const isSelected = selectedAnswer === opt
            const showResult = answerResult !== null
            const isCorrectOption = showResult && opt === answerResult.correct_answer
            let style = { ...s.cardAnswer }
            let cls = ''
            if (showResult && isSelected && !isCorrectOption) { style = s.cardWrong; cls = 'wrong-shake' }
            else if (isCorrectOption) { style = s.cardCorrect; cls = 'correct-pop' }
            return <button key={opt} className={cls} style={style} disabled={selectedAnswer !== null} onClick={() => submitAnswer(opt)}>{opt}</button>
          })}
        </div>
        {resultBlock}
      </>
    )
  }

  const renderAchievements = () => {
    const total = achStates.length
    const done = achStates.filter((a) => a.unlocked).length
    return (
      <>
        <div style={{ ...s.streakCard, maxWidth: '380px', margin: '0 auto 1.5rem', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 500 }}>🏅 {done} / {total}</div>
          <div style={{ ...s.levelBarTrack, margin: '0.7rem 1rem 0' }}><div style={{ ...s.levelBarFill, width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        </div>
        {!userStats && (
          <p style={{ fontSize: '0.78rem', color: c.textSecondary, margin: '-0.5rem 0 1.25rem', position: 'relative', zIndex: 1 }}>
            {lang === 'ru' ? 'Не удалось загрузить общую статистику — часть прогресса может показываться нулевой.' : 'Could not load overall stats — some progress may show as zero.'}
          </p>
        )}
        {ACHIEVEMENT_GROUPS.map((g) => {
          const items = achStates.filter((a) => a.def.group === g.id)
          if (items.length === 0) return null
          const groupDone = items.filter((a) => a.unlocked).length
          return (
            <div key={g.id} style={{ maxWidth: '380px', margin: '0 auto 1.4rem', position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: c.textSecondary, marginBottom: '0.55rem', fontWeight: 500, letterSpacing: '0.03em' }}>
                <span>{g.title[lang].toUpperCase()}</span><span>{groupDone}/{items.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                {items.map((a) => (
                  <div key={a.def.id} style={a.unlocked ? s.achievementCardUnlocked : s.achievementCardLocked}>
                    <div style={{ fontSize: '1.6rem', filter: a.unlocked ? 'none' : 'grayscale(1)', opacity: a.unlocked ? 1 : 0.45 }}>{a.def.emoji}</div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem', marginTop: '0.4rem' }}>{a.def.title[lang]}</div>
                    <div style={{ fontSize: '0.72rem', color: c.textSecondary, marginTop: '0.2rem', lineHeight: 1.35 }}>{a.def.description[lang]}</div>
                    {a.unlocked ? (
                      <div style={{ fontSize: '0.72rem', color: GREEN, marginTop: '0.5rem' }}>✓ {lang === 'ru' ? 'Получено' : 'Unlocked'}</div>
                    ) : (
                      <>
                        <div style={{ ...s.levelBarTrack, height: '4px', marginTop: '0.55rem' }}><div style={{ ...s.levelBarFill, width: `${a.pct}%` }} /></div>
                        <div style={{ fontSize: '0.7rem', color: c.textSecondary, marginTop: '0.3rem' }}>{Math.min(a.value, a.def.target)} / {a.def.target}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </>
    )
  }

  const getMemoryQuestionText = (): string => {
    if (!task) return ''
    if (!answerResult) {
      const parts = task.question.split('\n\n')
      if (parts.length >= 2) return memoryHidden ? parts.slice(1).join('\n\n') : parts[0]
    }
    return task.question
  }

  const isTrialBlocked = access !== null && !access.subscription_active && !access.trial_active

  return (
    <div style={s.page}>
      <style>{`
        @keyframes screenIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .screen-anim { animation: screenIn 0.28s ease-out; }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        .skeleton-pulse { animation: pulse 1.3s ease-in-out infinite; }
        @keyframes twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
        .star-twinkle { animation: twinkle 3s ease-in-out infinite; }
        .diff-cell { aspect-ratio: 1; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid transparent; background: transparent; padding: 0; }
        @keyframes correctPop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
        .correct-pop { animation: correctPop 0.35s ease-out; }
        @keyframes wrongShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
        .wrong-shake { animation: wrongShake 0.3s ease-in-out; }
        @keyframes xpFly { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(-40px); opacity: 0; } }
        .xp-fly { animation: xpFly 1s ease-out forwards; }
        @keyframes confettiBurst { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; } }
        .confetti-dot { position: absolute; width: 7px; height: 7px; border-radius: 50%; animation: confettiBurst 0.6s ease-out forwards; }
        @keyframes shrinkBar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, -18px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .toast-in { animation: toastIn 0.35s ease-out; }
        .bg-blob { position: absolute; border-radius: 50%; will-change: transform; }
        .bg-a1 { width: 130vmax; height: 70vmax; left: -40vmax; top: -25vmax; background: radial-gradient(closest-side, rgba(34,230,160,0.42), rgba(34,230,160,0)); animation: auroraA 16s ease-in-out infinite alternate; }
        .bg-a2 { width: 110vmax; height: 60vmax; right: -45vmax; top: 5vmax; background: radial-gradient(closest-side, rgba(130,90,255,0.42), rgba(130,90,255,0)); animation: auroraB 21s ease-in-out infinite alternate; }
        .bg-a3 { width: 100vmax; height: 50vmax; left: -20vmax; bottom: -22vmax; background: radial-gradient(closest-side, rgba(40,190,255,0.3), rgba(40,190,255,0)); animation: auroraC 26s ease-in-out infinite alternate; }
        @keyframes auroraA { from { transform: translate3d(0, 0, 0) scale(1) rotate(-8deg); } to { transform: translate3d(20vmax, 14vmax, 0) scale(1.25) rotate(10deg); } }
        @keyframes auroraB { from { transform: translate3d(0, 0, 0) scale(1.1) rotate(6deg); } to { transform: translate3d(-24vmax, 10vmax, 0) scale(0.9) rotate(-12deg); } }
        @keyframes auroraC { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(26vmax, -12vmax, 0) scale(1.2); } }
        .bg-ray { position: absolute; top: -10%; width: 20vw; height: 120%; background: linear-gradient(180deg, rgba(150,225,255,0.22), rgba(150,225,255,0) 75%); transform-origin: top; transform: skewX(-18deg); animation: raySway 10s ease-in-out infinite alternate; }
        @keyframes raySway { from { transform: skewX(-24deg); opacity: 0.45; } to { transform: skewX(-8deg); opacity: 1; } }
        .bg-bubble { position: absolute; bottom: -40px; border-radius: 50%; border: 1px solid rgba(180,235,255,0.4); background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), rgba(255,255,255,0.03)); animation: bubbleRise linear infinite; }
        @keyframes bubbleRise { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.9; } 100% { transform: translate(var(--sway, 20px), -115vh); opacity: 0; } }
        .bg-sun { position: absolute; left: 50%; bottom: 15%; width: min(58vw, 230px); aspect-ratio: 1; transform: translateX(-50%); border-radius: 50%; background: linear-gradient(180deg, #fff08a 0%, #ff9b5e 45%, #ff2e88 100%); opacity: 0.7; -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 50%, transparent 50%, transparent 55%, #000 55%, #000 64%, transparent 64%, transparent 71%, #000 71%, #000 79%, transparent 79%, transparent 87%, #000 87%); mask-image: linear-gradient(180deg, #000 0%, #000 50%, transparent 50%, transparent 55%, #000 55%, #000 64%, transparent 64%, transparent 71%, #000 71%, #000 79%, transparent 79%, transparent 87%, #000 87%); }
        .bg-floor { position: absolute; left: -40%; right: -40%; bottom: 0; height: 46%; background: linear-gradient(rgba(255,110,220,0.6) 2px, transparent 2px) 0 0 / 100% 46px, linear-gradient(90deg, rgba(255,110,220,0.6) 2px, transparent 2px) 0 0 / 70px 100%, linear-gradient(180deg, #24004a, #12002b); transform: perspective(300px) rotateX(62deg); transform-origin: 50% 100%; animation: gridMove 1.8s linear infinite; }
        @keyframes gridMove { from { background-position: 0 0, 0 0, 0 0; } to { background-position: 0 46px, 0 0, 0 0; } }
        @media (prefers-reduced-motion: reduce) { .bg-blob, .bg-ray, .bg-bubble, .bg-floor { animation: none; } }
      `}</style>

      <BackgroundLayer kind={background} />
      {background === 'space' && <StarField />}

      {toastDef && (
        <div key={toastDef.id} className="toast-in" style={s.toast} onClick={() => setToastQueue((q) => q.slice(1))}>
          <div style={{ fontSize: '1.9rem' }}>{toastDef.emoji}</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.66rem', color: GOLD, fontWeight: 600, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{lang === 'ru' ? 'ДОСТИЖЕНИЕ ПОЛУЧЕНО' : 'ACHIEVEMENT UNLOCKED'}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 500, marginTop: '0.1rem' }}>{toastDef.title[lang]}</div>
          </div>
        </div>
      )}

      {screen !== 'welcome' && (
        <>
          {bgMenuOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setBgMenuOpen(false)} />}
          <div style={s.topControls}>
            <button style={s.toggleBtn} onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>{lang === 'ru' ? 'RU' : 'EN'}</button>
            <div style={{ position: 'relative' }}>
              <button style={s.toggleBtn} onClick={() => setBgMenuOpen((v) => !v)} aria-label="background">{bgMeta.icon}</button>
              {bgMenuOpen && (
                <div style={s.bgMenu}>
                  {BACKGROUNDS.map((b) => (
                    <button key={b.id} style={{ ...s.bgRow, borderColor: b.id === background ? NEON : 'transparent' }} onClick={() => { setBackground(b.id); setBgMenuOpen(false) }}>
                      <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: b.swatch, border: '1px solid rgba(128,128,128,0.45)', flexShrink: 0 }} />
                      <span>{b.name[lang]}</span>
                      {b.id === background && <span style={{ marginLeft: 'auto', color: NEON }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {screen === 'welcome' && (
        <div style={s.welcomeWrap}>
          <div style={{ marginBottom: '1rem' }}><Brain3D size={140} /></div>
          <h1 style={s.welcomeTitle}>{t.welcomeTitle}</h1>
          <p style={s.welcomeSubtitle}>{t.welcomeSubtitle}</p>
          <button style={s.nextButton} onClick={() => { setWarmupStep(0); setWarmupCorrect(0); setWarmupAnswered(null); setScreen('warmup') }}>{t.start}</button>
        </div>
      )}

      {screen === 'warmup' && (
        <div className="screen-anim">
          <h1 style={s.title}>{t.warmupTitle}</h1>
          <p style={s.subtitle}>{t.warmupSubtitle}</p>
          <p style={s.question}>{warmupQuestions[warmupStep].question[lang]}</p>
          <div style={s.gridAnswers}>
            {warmupQuestions[warmupStep].options.map((opt) => {
              const isCorrectOption = opt === warmupQuestions[warmupStep].correct
              const isSelectedWrong = warmupAnswered !== null && opt === warmupAnswered && !isCorrectOption
              let style = { ...s.cardAnswer }
              if (warmupAnswered !== null && isCorrectOption) style = s.cardCorrect
              else if (isSelectedWrong) style = s.cardWrong
              return <button key={opt} style={style} disabled={warmupAnswered !== null} onClick={() => answerWarmup(opt)}>{opt}</button>
            })}
          </div>
          {warmupAnswered !== null && <button style={s.nextButton} onClick={proceedWarmup}>{t.continueBtn}</button>}
        </div>
      )}

      {screen === 'warmupResult' && (
        <div className="screen-anim" style={s.welcomeWrap}>
          <div style={s.welcomeEmoji}>🎯</div>
          <h1 style={s.welcomeTitle}>{t.warmupResultTitle}</h1>
          <p style={{ ...s.welcomeSubtitle, fontSize: '1.2rem', color: c.text }}>{t.warmupLevels[warmupLevel]}</p>
          <button style={s.nextButton} onClick={() => setScreen('topic')}>{t.continueBtn}</button>
        </div>
      )}

      {screen === 'topic' && (
        <div className="screen-anim">
          <button style={s.statsButton} onClick={openStats} aria-label={t.stats}>📊</button>
          <h1 style={s.title}>{t.appName}</h1>
          {userStats && (
            <div style={s.levelBarWrap}>
              <div style={s.levelBarLabel}>
                <span>{t.level} {userStats.level}</span>
                <span style={{ color: c.textSecondary }}>{userStats.xp_into_level}/{userStats.xp_for_next_level} XP</span>
              </div>
              <div style={s.levelBarTrack}><div style={{ ...s.levelBarFill, width: `${(userStats.xp_into_level / userStats.xp_for_next_level) * 100}%` }} /></div>
            </div>
          )}
          {access && (
            access.subscription_active
              ? <p style={{ color: GREEN, fontSize: '0.85rem', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>{t.subscribed}</p>
              : <p style={{ color: access.trial_seconds_left <= 3600 ? RED : c.textSecondary, fontSize: '0.85rem', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>⏳ {t.trialLabel}: {formatTrialTime(access.trial_seconds_left)}</p>
          )}
          <p style={s.subtitle}>{t.chooseTopic}</p>
          <div style={s.gridTopics}>
            {TOPIC_KEYS.map((key) => (
              <button key={key} style={s.card} onClick={() => {
                if (isTrialBlocked) { setScreen('paywall'); return }
                setSelectedTopic(key); setScreen('difficulty')
              }}>
                {key === 'memory' ? <Brain3D size={40} /> : <div style={s.cardEmoji}>{TOPIC_EMOJI[key]}</div>}
                <div style={s.cardLabel}>{t.topics[key]}</div>
              </button>
            ))}
            {PREMIUM_TOPIC_KEYS.map((key) => {
              const unlocked = !!access?.subscription_active && !!access?.owns_premium_topics
              return (
                <div key={key} style={{ position: 'relative' }}>
                  <button style={{ ...s.card, width: '100%', border: `0.5px solid ${GOLD}` }} onClick={() => {
                    if (!access?.subscription_active) { setScreen('paywall'); return }
                    if (!access?.owns_premium_topics) { setScreen('premiumPurchase'); return }
                    setSelectedTopic(key); setScreen('difficulty')
                  }}>
                    <div style={s.cardEmoji}>{TOPIC_EMOJI[key]}</div>
                    <div style={s.cardLabel}>{t.topics[key]}</div>
                  </button>
                  {!unlocked && <div style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', fontSize: '0.9rem' }}>💎</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {screen === 'paywall' && (
        <div className="screen-anim" style={s.welcomeWrap}>
          <div style={s.welcomeEmoji}>⏳</div>
          <h1 style={s.welcomeTitle}>{t.trialOverTitle}</h1>
          <p style={s.welcomeSubtitle}>{t.trialOverSubtitle}</p>
          <button style={s.nextButton} disabled={payLoading} onClick={() => paySubscription('stars')}>⭐ {payLoading ? t.creatingInvoice : t.payWithStars}</button>
          <button style={{ ...s.nextButton, marginTop: '0.75rem', background: 'transparent', border: `0.5px solid ${c.cardBorder}`, color: c.text }} disabled={payLoading} onClick={() => paySubscription('crypto')}>💎 {payLoading ? t.creatingInvoice : t.payWithCrypto}</button>
        </div>
      )}

      {screen === 'premiumPurchase' && (
        <div className="screen-anim" style={s.welcomeWrap}>
          <div style={s.welcomeEmoji}>💎</div>
          <h1 style={s.welcomeTitle}>{t.premiumBuyTitle}</h1>
          <p style={s.welcomeSubtitle}>{t.premiumBuySubtitle}</p>
          <button style={s.nextButton} disabled={payLoading} onClick={() => payPremium('stars')}>⭐ {payLoading ? t.creatingInvoice : t.payWithStars}</button>
          <button style={{ ...s.nextButton, marginTop: '0.75rem', background: 'transparent', border: `0.5px solid ${c.cardBorder}`, color: c.text }} disabled={payLoading} onClick={() => payPremium('crypto')}>💎 {payLoading ? t.creatingInvoice : t.payWithCrypto}</button>
          <button style={s.backButtonStatic} onClick={() => setScreen('topic')}>{t.back}</button>
        </div>
      )}

      {screen === 'difficulty' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen('topic')}>{t.back}</button>
          <h1 style={s.title}>{selectedTopic && t.topics[selectedTopic]}</h1>
          <p style={s.subtitle}>{t.chooseDifficulty}</p>
          <div style={s.gridDifficulty}>
            {DIFFICULTY_KEYS.map((key) => (
              <button key={key} style={s.cardSmall} onClick={() => { setSelectedDifficulty(key); resetSeries(); if (selectedTopic) loadTask(selectedTopic, key) }}>
                <div style={s.cardEmoji}>{DIFFICULTY_EMOJI[key]}</div>
                <div style={s.cardLabel}>{t.difficulties[key]}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === 'task' && selectedTopic === 'differences' && diffBoard && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={leaveTask}>{t.back}</button>
          <p style={{ ...s.subtitle, marginTop: '3rem', marginBottom: '1rem' }}>{t.found}: {diffFound.length} / {diffBoard.diffCount}</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${diffBoard.size}, 1fr)`, gap: '4px', maxWidth: '380px', margin: '0 auto' }}>
            {diffBoard.cells.map((emoji, i) => {
              const found = diffFound.includes(i)
              return <button key={i} className="diff-cell" style={{ fontSize: diffBoard.size === 8 ? '1.2rem' : diffBoard.size === 10 ? '1rem' : '0.85rem', borderColor: found ? GREEN : 'transparent', background: found ? 'rgba(34,197,94,0.12)' : 'transparent' }} onClick={() => tapDiffCell(i)}>{emoji}</button>
            })}
          </div>
          {answerResult && (
            <>
              {answerResult.is_correct && <CelebrateFX xp={answerResult.xp_earned} />}
              <p style={s.explanation}>{answerResult.explanation}</p>
              <button style={s.nextButton} onClick={handleNext}>{t.nextTask}</button>
            </>
          )}
        </div>
      )}

      {screen === 'task' && selectedTopic === 'reading' && task && readTask && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={leaveTask}>{t.back}</button>
          {renderReading()}
        </div>
      )}

      {screen === 'task' && selectedTopic !== 'differences' && selectedTopic !== 'reading' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={leaveTask}>{t.back}</button>
          {loadError ? (
            <div style={{ maxWidth: '320px', margin: '4rem auto 0' }}>
              <p style={{ color: c.textSecondary, marginBottom: '1.5rem' }}>❌ {t.loadError}</p>
              <button style={s.nextButton} onClick={() => selectedTopic && selectedDifficulty && loadTask(selectedTopic, selectedDifficulty)}>{t.retryBtn}</button>
            </div>
          ) : loading || !task ? (
            <div style={{ maxWidth: '380px', margin: '3rem auto 0' }}>
              <Skeleton height="20px" width="80%" bg={c.skeletonBg} style={{ margin: '0 auto 12px' }} />
              <Skeleton height="20px" width="60%" bg={c.skeletonBg} style={{ margin: '0 auto 32px' }} />
              <div style={s.gridAnswers}>
                <Skeleton height="56px" width="100%" bg={c.skeletonBg} /><Skeleton height="56px" width="100%" bg={c.skeletonBg} />
                <Skeleton height="56px" width="100%" bg={c.skeletonBg} /><Skeleton height="56px" width="100%" bg={c.skeletonBg} />
              </div>
            </div>
          ) : (
            <>
              {task.timeLimit !== undefined && (
                <p style={{ fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.5rem', minHeight: '1.1em', color: !answerResult && timeLeft !== null && timeLeft <= 2 ? RED : c.textSecondary }}>
                  {!answerResult && timeLeft !== null ? `⏱ ${t.timeLeftLabel}: ${timeLeft}` : ''}
                </p>
              )}
              {task.isColorTask && <p style={{ fontSize: '0.78rem', color: c.textSecondary, marginBottom: '0.5rem' }}>{t.colorInstruction}</p>}
              <p style={{ ...s.question, marginBottom: task.cells ? '1rem' : s.question.marginBottom, color: task.isColorTask && !answerResult ? task.colorHex : c.text }}>
                {selectedTopic === 'memory' ? getMemoryQuestionText() : task.question}
              </p>
              {task.cells && task.cols && (
                <div style={s.matrixGrid}>
                  {task.cells.map((cell, i) => {
                    const isHole = cell === '?'
                    const solved = isHole && answerResult !== null
                    const shown = solved ? (task.correct || '') : cell
                    let extra: React.CSSProperties = {}
                    if (isHole && !solved) extra = { border: `1.5px dashed ${NEON}`, color: NEON, fontWeight: 600 }
                    else if (solved) extra = answerResult?.is_correct ? { background: 'rgba(34, 197, 94, 0.12)', border: `0.5px solid ${GREEN}` } : { background: 'rgba(239, 68, 68, 0.12)', border: `0.5px solid ${RED}` }
                    return <div key={i} style={{ ...s.matrixCell, width: `calc(${100 / (task.cols as number)}% - 6px)`, fontSize: cellFontSize(shown, task.cols as number), ...extra }}>{shown}</div>
                  })}
                </div>
              )}
              {selectedTopic === 'memory' && !memoryHidden && !answerResult && (
                <p style={{ fontSize: '0.78rem', color: c.textSecondary, marginTop: '-1.5rem', marginBottom: '1.5rem' }}>{t.memorizeHint}</p>
              )}
              {(selectedTopic !== 'memory' || memoryHidden || answerResult) && (
                <div style={s.gridAnswers}>
                  {task.options.map((opt) => {
                    const isSelected = selectedAnswer === opt
                    const showResult = answerResult !== null
                    const isCorrectOption = showResult && opt === answerResult.correct_answer
                    let style = { ...s.cardAnswer }
                    let cls = ''
                    if (showResult && isSelected && !isCorrectOption) { style = s.cardWrong; cls = 'wrong-shake' }
                    else if (isCorrectOption) { style = s.cardCorrect; cls = 'correct-pop' }
                    const optStyle: React.CSSProperties = task.cells ? { ...style, fontSize: cellFontSize(opt, 3), whiteSpace: 'pre-wrap', lineHeight: 1.15 } : style
                    return <button key={opt} className={cls} style={optStyle} disabled={selectedAnswer !== null} onClick={() => submitAnswer(opt)}>{opt}</button>
                  })}
                </div>
              )}
              {answerResult && (
                <>
                  {answerResult.is_correct && <CelebrateFX xp={answerResult.xp_earned} />}
                  <p style={s.explanation}>{answerResult.explanation}</p>
                  {task.kindLabel && <p style={{ ...s.explanation, marginTop: '0.5rem', fontSize: '0.78rem' }}>🏷 Тип закономерности: {task.kindLabel}</p>}
                  <button style={s.nextButton} onClick={handleNext}>{t.nextTask}</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {screen === 'summary' && selectedTopic && (
        <div className="screen-anim" style={s.welcomeWrap}>
          <div style={s.welcomeEmoji}>{seriesLog.filter((e) => e.ok).length === SERIES_LENGTH ? '🔥' : '💪'}</div>
          <h1 style={s.welcomeTitle}>{seriesLog.filter((e) => e.ok).length}/{SERIES_LENGTH} {t.correctOf}</h1>
          <p style={{ ...s.welcomeSubtitle, marginBottom: seriesPerfect ? '0.6rem' : (selectedTopic === 'matrices' || selectedTopic === 'reading') ? '1.5rem' : '3rem' }}>{t.topics[selectedTopic]} — {t.seriesDone}</p>
          {seriesPerfect && <p style={{ color: GOLD, fontSize: '0.85rem', margin: `0 0 ${selectedTopic === 'matrices' || selectedTopic === 'reading' ? '1.5rem' : '3rem'}` }}>💎 {lang === 'ru' ? `Идеальная серия! Всего таких: ${meta.perfectSeries}` : `Perfect series! Total: ${meta.perfectSeries}`}</p>}
          {selectedTopic === 'matrices' && renderMatrixSummary()}
          {selectedTopic === 'reading' && renderReadingSummary()}
          <button style={s.nextButton} onClick={continueAfterSummary}>{t.continueBtn}</button>
        </div>
      )}

      {screen === 'stats' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen(prevScreen)}>{t.back}</button>
          <h1 style={s.title}>{t.stats}</h1>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
            <button style={s.linkBtn} onClick={openAchievements}>🏅 {t.achievements}{achStates.length > 0 ? ` ${achStates.filter((a) => a.unlocked).length}/${achStates.length}` : ''}</button>
            <button style={s.linkBtn} onClick={openLeaderboard}>📈 {t.leaderboard}</button>
            <button style={s.linkBtn} onClick={openInvite}>🎁 {t.inviteBtn}</button>
          </div>
          {statsLoading || !userStats ? (
            <div style={{ maxWidth: '380px', margin: '0 auto' }}><div style={s.streakRow}><Skeleton height="76px" width="100%" bg={c.skeletonBg} /><Skeleton height="76px" width="100%" bg={c.skeletonBg} /></div></div>
          ) : (
            <div style={s.statsWrap}>
              <div style={s.levelBarWrap}>
                <div style={s.levelBarLabel}><span>{t.level} {userStats.level}</span><span style={{ color: c.textSecondary }}>{userStats.xp_into_level}/{userStats.xp_for_next_level} XP</span></div>
                <div style={s.levelBarTrack}><div style={{ ...s.levelBarFill, width: `${(userStats.xp_into_level / userStats.xp_for_next_level) * 100}%` }} /></div>
              </div>
              <div style={s.streakRow}>
                <div style={s.streakCard}><div style={s.streakValue}>🔥 {userStats.current_streak}</div><div style={s.streakLabel}>{t.currentStreak}</div></div>
                <div style={s.streakCard}><div style={s.streakValue}>🏆 {userStats.longest_streak}</div><div style={s.streakLabel}>{t.bestStreak}</div></div>
              </div>
              <p style={s.subtitle}>{t.total}: {userStats.correct} / {userStats.total} · {t.xpTotal}: {userStats.total_xp}</p>
              <div style={s.categoryList}>
                {[...TOPIC_KEYS, ...PREMIUM_TOPIC_KEYS].map((key) => {
                  const catStats = userStats.by_category.find((cat) => cat.category === key)
                  return <div key={key} style={s.categoryRow}><span>{t.topics[key]}</span><span style={{ color: c.textSecondary }}>{catStats?.correct || 0} / {catStats?.total || 0}</span></div>
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {screen === 'achievements' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen('stats')}>{t.back}</button>
          <h1 style={{ ...s.title, marginBottom: '1.5rem' }}>{t.achievements}</h1>
          {renderAchievements()}
        </div>
      )}

      {screen === 'leaderboard' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen('stats')}>{t.back}</button>
          <h1 style={s.title}>{t.leaderboard}</h1>
          {leaderboardLoading || !leaderboardData ? <Skeleton height="50px" width="100%" bg={c.skeletonBg} /> : (
            <div style={s.statsWrap}>
              {leaderboardData.my_rank !== null && <p style={{ ...s.subtitle, marginBottom: '1.25rem' }}>{t.yourRank}: #{leaderboardData.my_rank}</p>}
              <div style={s.categoryList}>
                {leaderboardData.top.map((entry, idx) => (
                  <div key={entry.user_id} style={{ ...s.categoryRow, border: entry.user_id === userId ? `0.5px solid ${NEON}` : s.categoryRow.border }}>
                    <span>#{idx + 1} {entry.username || t.anonymousPlayer}</span><span style={{ color: c.textSecondary }}>{entry.total_xp} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {screen === 'invite' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen('stats')}>{t.back}</button>
          <h1 style={s.title}>{t.inviteTitle}</h1>
          <p style={s.subtitle}>{t.inviteSubtitle}</p>
          <div style={s.statsWrap}>
            <div style={s.streakRow}>
              <div style={s.streakCard}>
                <div style={s.streakValue}>👥 {referralStats?.referrals_count ?? 0}</div>
                <div style={s.streakLabel}>{t.referralsCount}</div>
              </div>
              <div style={s.streakCard}>
                <div style={s.streakValue}>🎁 {referralStats?.days_earned ?? 0}</div>
                <div style={s.streakLabel}>{t.daysEarned}</div>
              </div>
              <div style={s.streakCard}>
                <div style={s.streakValue}>⏳ {referralStats?.pending_count ?? 0}</div>
                <div style={s.streakLabel}>{t.pendingCount}</div>
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: c.textSecondary, marginBottom: '0.5rem', textAlign: 'left' }}>{t.yourLink}</p>
            <div style={{ background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '12px', padding: '0.8rem 1rem', fontSize: '0.78rem', wordBreak: 'break-all', textAlign: 'left', marginBottom: '1rem' }}>
              {referralLink}
            </div>
            <button style={s.nextButton} onClick={copyReferralLink}>{linkCopied ? `✅ ${t.copied}` : `📋 ${t.copyLink}`}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function getStyles(c: typeof PALETTES.dark): Record<string, React.CSSProperties> {
  return {
    page: { minHeight: '100vh', background: c.bg, color: c.text, fontFamily: '-apple-system, sans-serif', padding: '2.5rem 1.25rem', textAlign: 'center', position: 'relative', overflow: 'hidden', isolation: 'isolate' },
    topControls: { position: 'absolute', top: '1.75rem', right: '1.25rem', display: 'flex', gap: '0.5rem', zIndex: 6 },
    toggleBtn: { background: 'transparent', border: `0.5px solid ${c.cardBorder}`, borderRadius: '10px', padding: '0.35rem 0.55rem', fontSize: '0.8rem', color: c.text, cursor: 'pointer' },
    welcomeWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', position: 'relative', zIndex: 1 },
    welcomeEmoji: { fontSize: '3rem', marginBottom: '1.75rem' },
    welcomeTitle: { fontSize: '1.3rem', fontWeight: 500, maxWidth: '300px', margin: '0 0 0.5rem', lineHeight: 1.45, color: c.text },
    welcomeSubtitle: { color: c.textSecondary, fontSize: '0.95rem', marginBottom: '3rem' },
    title: { fontSize: '1.5rem', fontWeight: 500, marginTop: '2.5rem', marginBottom: '0.35rem', position: 'relative', zIndex: 1, color: c.text },
    subtitle: { color: c.textSecondary, marginBottom: '2.5rem', fontSize: '0.9rem', position: 'relative', zIndex: 1 },
    question: { fontSize: '1.05rem', marginTop: '1rem', marginBottom: '2rem', whiteSpace: 'pre-line', lineHeight: 1.5, position: 'relative', zIndex: 1 },
    backButton: { position: 'absolute', top: '1.75rem', left: '1.25rem', background: 'transparent', border: 'none', color: c.textSecondary, fontSize: '0.9rem', cursor: 'pointer', zIndex: 2 },
    backButtonStatic: { marginTop: '1.5rem', background: 'transparent', border: 'none', color: c.textSecondary, fontSize: '0.9rem', cursor: 'pointer', position: 'relative', zIndex: 1 },
    statsButton: { position: 'absolute', top: '1.75rem', left: '1.25rem', background: 'transparent', border: `0.5px solid ${c.cardBorder}`, borderRadius: '10px', padding: '0.4rem 0.6rem', fontSize: '1.1rem', cursor: 'pointer', zIndex: 2 },
    levelBarWrap: { maxWidth: '380px', margin: '0 auto 1.75rem', position: 'relative', zIndex: 1 },
    levelBarLabel: { display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', fontWeight: 500 },
    levelBarTrack: { height: '6px', borderRadius: '999px', background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, overflow: 'hidden' },
    levelBarFill: { height: '100%', borderRadius: '999px', background: NEON, transition: 'width 0.3s ease' },
    gridTopics: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', maxWidth: '380px', margin: '0 auto', position: 'relative', zIndex: 1 },
    gridDifficulty: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem', maxWidth: '380px', margin: '0 auto', position: 'relative', zIndex: 1 },
    gridAnswers: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', maxWidth: '380px', margin: '0 auto', position: 'relative', zIndex: 1 },
    card: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '18px', padding: '1.6rem 1rem', color: c.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' },
    cardSmall: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '16px', padding: '1.1rem 0.5rem', color: c.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem' },
    cardAnswer: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '16px', padding: '1rem 0.5rem', color: c.text, fontSize: '0.95rem', cursor: 'pointer' },
    cardCorrect: { background: 'rgba(34, 197, 94, 0.12)', border: `0.5px solid ${GREEN}`, borderRadius: '16px', padding: '1rem 0.5rem', color: c.text, fontSize: '0.95rem' },
    cardWrong: { background: 'rgba(239, 68, 68, 0.12)', border: `0.5px solid ${RED}`, borderRadius: '16px', padding: '1rem 0.5rem', color: c.text, fontSize: '0.95rem' },
    matrixGrid: { display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', maxWidth: '380px', margin: '0 auto 1.6rem', position: 'relative', zIndex: 1 },
    matrixCell: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '12px', minHeight: '58px', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.15, boxSizing: 'border-box', padding: '4px', textAlign: 'center', color: c.text },
    cardEmoji: { fontSize: '1.8rem' },
    cardLabel: { fontSize: '0.95rem', fontWeight: 500 },
    explanation: { whiteSpace: 'pre-line', marginTop: '1.75rem', color: c.textSecondary, fontSize: '0.88rem', maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5, position: 'relative', zIndex: 1 },
    nextButton: { marginTop: '1.75rem', background: NEON, border: 'none', borderRadius: '14px', padding: '0.85rem 1.5rem', color: '#fff', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', position: 'relative', zIndex: 1 },
    linkBtn: { background: 'transparent', border: `0.5px solid ${c.cardBorder}`, borderRadius: '12px', padding: '0.6rem 1rem', color: c.text, fontSize: '0.85rem', cursor: 'pointer' },
    statsWrap: { maxWidth: '380px', margin: '0 auto', position: 'relative', zIndex: 1 },
    streakRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1.75rem' },
    streakCard: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '16px', padding: '1.1rem 0.5rem' },
    streakValue: { fontSize: '1.2rem', fontWeight: 500, marginBottom: '0.3rem' },
    streakLabel: { fontSize: '0.78rem', color: c.textSecondary },
    categoryList: { display: 'flex', flexDirection: 'column', gap: '0.55rem' },
    categoryRow: { display: 'flex', justifyContent: 'space-between', background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '12px', padding: '0.8rem 1rem', fontSize: '0.9rem' },
    achievementCardUnlocked: { background: 'rgba(77, 77, 255, 0.12)', border: `0.5px solid ${NEON}`, borderRadius: '16px', padding: '1rem 0.75rem', boxShadow: '0 0 14px rgba(77, 77, 255, 0.22)' },
    achievementCardLocked: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '16px', padding: '1rem 0.75rem' },
    pill: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '999px', padding: '0.25rem 0.75rem', fontSize: '0.75rem', color: c.textSecondary },
    readCard: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '18px', padding: '1.25rem 1.1rem', maxWidth: '380px', margin: '0 auto', position: 'relative', zIndex: 1, boxSizing: 'border-box' },
    timerTrack: { height: '4px', borderRadius: '999px', background: c.cardBg, maxWidth: '380px', margin: '1rem auto 0', overflow: 'hidden', position: 'relative', zIndex: 1 },
    timerFill: { height: '100%', width: '100%', background: NEON, borderRadius: '999px', transformOrigin: 'left center' },
    toast: { position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(18, 18, 38, 0.97)', color: '#fff', border: `0.5px solid ${GOLD}`, borderRadius: '16px', padding: '0.7rem 1.1rem', boxShadow: '0 8px 30px rgba(0,0,0,0.45)', cursor: 'pointer', width: 'max-content', maxWidth: '90vw', boxSizing: 'border-box' },
    bgMenu: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '215px', background: c.bg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '14px', padding: '0.4rem', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '2px' },
    bgRow: { display: 'flex', alignItems: 'center', gap: '0.65rem', background: 'transparent', border: '1px solid transparent', borderRadius: '10px', padding: '0.5rem 0.6rem', color: c.text, fontSize: '0.88rem', cursor: 'pointer', textAlign: 'left' },
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  )
}

export default App
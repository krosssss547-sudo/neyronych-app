import { useEffect, useState } from 'react'

declare global {
  interface Window {
    Telegram: any
  }
}

type Screen = 'welcome' | 'warmup' | 'warmupResult' | 'topic' | 'difficulty' | 'task' | 'summary' | 'stats' | 'achievements' | 'leaderboard' | 'paywall' | 'premiumPurchase' | 'invite'
type Topic = 'memory' | 'attention' | 'logic' | 'math' | 'differences' | 'speed' | 'colors' | 'words' | 'matrices' | 'reading'
type Difficulty = 1 | 2 | 3
type Background = 'space' | 'black' | 'white'
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
}
type AnswerResult = { is_correct: boolean; correct_answer: string; explanation: string; xp_earned: number }
type TopicStats = Record<Topic, { total: number; correct: number }>
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
type ReferralStats = { referrals_count: number; days_earned: number }

type Achievement = {
  id: string
  emoji: string
  title: { ru: string; en: string }
  description: { ru: string; en: string }
}

type LeaderboardEntry = { user_id: number; username: string | null; total_xp: number; current_streak: number }
type LeaderboardData = { top: LeaderboardEntry[]; my_rank: number | null }

const ACHIEVEMENTS: Achievement[] = [
  { id: 'streak_5', emoji: '🔥', title: { ru: '5 дней подряд', en: '5-day streak' }, description: { ru: 'Держи стрик 5 дней', en: 'Keep a 5-day streak' } },
  { id: 'streak_10', emoji: '🔥', title: { ru: '10 дней подряд', en: '10-day streak' }, description: { ru: 'Держи стрик 10 дней', en: 'Keep a 10-day streak' } },
  { id: 'streak_30', emoji: '🔥', title: { ru: '30 дней подряд', en: '30-day streak' }, description: { ru: 'Держи стрик 30 дней', en: 'Keep a 30-day streak' } },
  { id: 'correct_50', emoji: '✅', title: { ru: '50 правильных', en: '50 correct' }, description: { ru: 'Ответь правильно 50 раз', en: 'Answer correctly 50 times' } },
  { id: 'correct_100', emoji: '✅', title: { ru: '100 правильных', en: '100 correct' }, description: { ru: 'Ответь правильно 100 раз', en: 'Answer correctly 100 times' } },
  { id: 'correct_250', emoji: '✅', title: { ru: '250 правильных', en: '250 correct' }, description: { ru: 'Ответь правильно 250 раз', en: 'Answer correctly 250 times' } },
  { id: 'level_5', emoji: '⭐', title: { ru: '5 уровень', en: 'Level 5' }, description: { ru: 'Достигни 5 уровня', en: 'Reach level 5' } },
  { id: 'level_10', emoji: '⭐', title: { ru: '10 уровень', en: 'Level 10' }, description: { ru: 'Достигни 10 уровня', en: 'Reach level 10' } },
  { id: 'category_master', emoji: '🏅', title: { ru: 'Мастер темы', en: 'Topic master' }, description: { ru: '20 правильных в одной теме', en: '20 correct in one topic' } },
]

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
const BACKGROUND_ORDER: Background[] = ['space', 'black', 'white']
const BACKGROUND_ICON: Record<Background, string> = { space: '🌌', black: '⚫', white: '⚪' }
const SERIES_LENGTH = 5

const API_URL = 'https://neyronych-app.onrender.com'

const WARMUP_QUESTIONS = [
  { question: { ru: '17 × 6 = ?', en: '17 × 6 = ?' }, options: ['96', '102', '112', '108'], correct: '102' },
  { question: { ru: 'Продолжи: 1, 1, 2, 3, 5, 8, ?', en: 'Continue: 1, 1, 2, 3, 5, 8, ?' }, options: ['11', '13', '10', '12'], correct: '13' },
]

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

const MATRICES_BANK: Record<Difficulty, { question: string; options: string[]; correct: string; explanation: string }[]> = {
  1: [{ question: 'Продолжи ряд:\n🔵 🔶 🔵 🔶 🔵 ?', options: ['🔵', '🔶', '🟢', '🔺'], correct: '🔶', explanation: 'Фигуры чередуются через одну' }],
  2: [{ question: 'Найди недостающую фигуру:\n🔺🔺 🔷🔷 🔺🔺🔺 🔷🔷🔷 ?', options: ['🔺🔺🔺🔺', '🔷🔷', '🔺', '🔷🔷🔷🔷'], correct: '🔺🔺🔺🔺', explanation: 'Каждая следующая группа того же символа на 1 больше предыдущей такой же' }],
  3: [{ question: 'Закономерность: 🔵→🔵🔵→🔵🔵🔵🔵→🔵🔵🔵🔵🔵🔵🔵🔵\n\nСколько будет дальше?', options: ['12', '16', '10', '9'], correct: '16', explanation: 'Каждый раз количество удваивается: 1,2,4,8,16' }],
}

function generateMatricesTask(difficulty: Difficulty): Task {
  const pool = MATRICES_BANK[difficulty]
  const picked = pool[rand(0, pool.length - 1)]
  return { task_id: 'matrix-' + Date.now(), ...picked }
}

const READING_BANK: Record<Difficulty, { passage: string; question: string; options: string[]; correct: string; explanation: string; readSeconds: number }[]> = {
  1: [{ passage: 'Кот сидел на подоконнике и смотрел на дождь за окном. На улице было холодно, и он был рад, что находится дома в тепле.', question: 'Где сидел кот?', options: ['На диване', 'На подоконнике', 'В коробке', 'На столе'], correct: 'На подоконнике', explanation: 'В тексте прямо сказано: "сидел на подоконнике"', readSeconds: 8 }],
  2: [{ passage: 'Экспедиция вышла на рассвете, чтобы успеть пересечь перевал до полудня, когда в горах обычно начинается сильный ветер и видимость резко падает.', question: 'Почему экспедиция вышла на рассвете?', options: ['Чтобы успеть пересечь перевал до ветра', 'Чтобы увидеть рассвет', 'Потому что так короче путь', 'Из-за холода ночью'], correct: 'Чтобы успеть пересечь перевал до ветра', explanation: 'Цель — пересечь перевал до полуденного ветра', readSeconds: 6 }],
  3: [{ passage: 'Несмотря на то что первоначальный план предполагал запуск проекта в марте, команда приняла решение перенести дату на два месяца вперёд из-за задержек с поставкой оборудования.', question: 'На сколько месяцев перенесли запуск?', options: ['На один', 'На два', 'На три', 'Не перенесли'], correct: 'На два', explanation: 'В тексте: "перенести дату на два месяца вперёд"', readSeconds: 5 }],
}

function generateReadingTask(difficulty: Difficulty): Task {
  const pool = READING_BANK[difficulty]
  const picked = pool[rand(0, pool.length - 1)]
  return { task_id: 'reading-' + Date.now(), question: picked.question, options: picked.options, correct: picked.correct, explanation: picked.explanation, passage: picked.passage, timeLimit: picked.readSeconds }
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
    inviteSubtitle: 'За каждого реально пришедшего друга — 2 дня подписки',
    yourLink: 'Твоя ссылка',
    copyLink: 'Скопировать',
    copied: 'Скопировано!',
    referralsCount: 'Друзей пришло',
    daysEarned: 'Дней получено',
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
    inviteSubtitle: 'Get 2 subscription days for every friend who joins',
    yourLink: 'Your link',
    copyLink: 'Copy',
    copied: 'Copied!',
    referralsCount: 'Friends joined',
    daysEarned: 'Days earned',
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

function formatTrialTime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  if (days > 0) return `${days}д ${hours}ч`
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}ч ${minutes}м`
  const seconds = totalSeconds % 60
  return `${minutes}м ${seconds}с`
}

function App() {
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
  const [readingHidden, setReadingHidden] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)
  const [topicStats, setTopicStats] = useState<TopicStats>({
    memory: { total: 0, correct: 0 }, attention: { total: 0, correct: 0 }, logic: { total: 0, correct: 0 }, math: { total: 0, correct: 0 },
    differences: { total: 0, correct: 0 }, speed: { total: 0, correct: 0 }, colors: { total: 0, correct: 0 }, words: { total: 0, correct: 0 },
    matrices: { total: 0, correct: 0 }, reading: { total: 0, correct: 0 },
  })
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(false)
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
    return saved === 'space' || saved === 'black' || saved === 'white' ? saved : 'space'
  })
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('neyronych_lang')
    return saved === 'ru' || saved === 'en' ? saved : 'ru'
  })

  const [warmupStep, setWarmupStep] = useState(0)
  const [warmupCorrect, setWarmupCorrect] = useState(0)
  const [warmupLevel, setWarmupLevel] = useState<Difficulty>(2)
  const [warmupAnswered, setWarmupAnswered] = useState<string | null>(null)

  const t = I18N[lang]
  const c = background === 'white' ? PALETTES.light : PALETTES.dark

  useEffect(() => { localStorage.setItem('neyronych_background', background) }, [background])
  useEffect(() => { localStorage.setItem('neyronych_lang', lang) }, [lang])

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

  const cycleBackground = () => {
    const idx = BACKGROUND_ORDER.indexOf(background)
    setBackground(BACKGROUND_ORDER[(idx + 1) % BACKGROUND_ORDER.length])
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

  const openPayLink = (url: string) => {
    const tg = window.Telegram?.WebApp
    if (url.includes('t.me/invoice') || url.includes('t.me/$')) {
      tg?.openInvoice ? tg.openInvoice(url) : window.open(url, '_blank')
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
      .catch(() => setPayLoading(false))
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
      .catch(() => setPayLoading(false))
  }

  const loadTask = (topic: Topic, difficulty: Difficulty) => {
    setSelectedAnswer(null)
    setAnswerResult(null)
    setDiffFound([])
    setDiffBoard(null)
    setTimeLeft(null)
    setLoadError(false)
    setMemoryHidden(false)
    setReadingHidden(false)

    if (topic === 'differences') {
      const board = generateDifferencesBoard(difficulty)
      setDiffBoard(board)
      setTask({ task_id: 'diff-' + Date.now(), question: '', options: [] })
      setScreen('task')
      return
    }

    if (CLIENT_TOPICS.includes(topic)) {
      let generated: Task
      if (topic === 'speed') generated = generateSpeedTask(difficulty)
      else if (topic === 'colors') generated = generateColorsTask(difficulty, lang)
      else if (topic === 'words') generated = generateWordsTask(difficulty)
      else if (topic === 'matrices') generated = generateMatricesTask(difficulty)
      else generated = generateReadingTask(difficulty)
      setTask({ ...generated, options: shuffleArray(generated.options) })
      if (topic === 'reading') {
        setTimeout(() => setReadingHidden(true), (generated.timeLimit || 6) * 1000)
      } else {
        setTimeLeft(generated.timeLimit || null)
      }
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
    if (timeLeft === null || answerResult) return
    if (timeLeft <= 0) { submitAnswer(''); return }
    const id = setTimeout(() => setTimeLeft((v) => (v !== null ? v - 1 : null)), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, answerResult])

  const submitAnswer = (opt: string) => {
    if (!task || !selectedTopic || selectedAnswer !== null) return
    setSelectedAnswer(opt)

    if (CLIENT_TOPICS.includes(selectedTopic)) {
      const isCorrect = opt === task.correct
      const result: AnswerResult = { is_correct: isCorrect, correct_answer: task.correct || '', explanation: task.explanation || '', xp_earned: isCorrect ? 10 : 0 }
      setAnswerResult(result)
      haptic(isCorrect ? 'success' : 'error')
      setTopicStats((prev) => {
        const topic = selectedTopic
        const p = prev[topic]
        return { ...prev, [topic]: { total: p.total + 1, correct: p.correct + (isCorrect ? 1 : 0) } }
      })
      if (userId !== null) {
        fetch(`${API_URL}/api/answer/client`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, category: selectedTopic, is_correct: isCorrect, xp_value: 10 }),
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
        setTopicStats((prev) => {
          const topic = selectedTopic
          const p = prev[topic]
          return { ...prev, [topic]: { total: p.total + 1, correct: p.correct + (data.is_correct ? 1 : 0) } }
        })
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
      setTopicStats((prev) => ({ ...prev, differences: { total: prev.differences.total + 1, correct: prev.differences.correct + 1 } }))
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
    const stats = topicStats[selectedTopic]
    if (stats.total > 0 && stats.total % SERIES_LENGTH === 0) setScreen('summary')
    else loadTask(selectedTopic, selectedDifficulty)
  }

  const continueAfterSummary = () => {
    if (!selectedTopic || !selectedDifficulty) return
    loadTask(selectedTopic, selectedDifficulty)
  }

  const fetchTopBarStats = (uid: number) => {
    fetch(`${API_URL}/api/stats/${uid}`).then((res) => res.json()).then((data: UserStats) => setUserStats(data)).catch(() => {})
  }

  useEffect(() => {
    if (userId !== null) fetchTopBarStats(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const openStats = () => {
    const uid = userId ?? 0
    setPrevScreen(screen); setScreen('stats'); setStatsLoading(true)
    fetch(`${API_URL}/api/stats/${uid}`).then((res) => res.json()).then((data: UserStats) => { setUserStats(data); setStatsLoading(false) }).catch(() => setStatsLoading(false))
  }

  const openAchievements = () => {
    const uid = userId ?? 0
    setScreen('achievements'); setAchievementsLoading(true)
    fetch(`${API_URL}/api/achievements/${uid}`).then((res) => res.json()).then((data: { unlocked: string[] }) => { setUnlockedAchievements(data.unlocked); setAchievementsLoading(false) }).catch(() => setAchievementsLoading(false))
  }

  const openLeaderboard = () => {
    setScreen('leaderboard'); setLeaderboardLoading(true)
    const uid = userId ?? 0
    fetch(`${API_URL}/api/leaderboard?user_id=${uid}`).then((res) => res.json()).then((data: LeaderboardData) => { setLeaderboardData(data); setLeaderboardLoading(false) }).catch(() => setLeaderboardLoading(false))
  }

  const answerWarmup = (opt: string) => {
    if (warmupAnswered !== null) return
    setWarmupAnswered(opt)
    const q = WARMUP_QUESTIONS[warmupStep]
    const isCorrect = opt === q.correct
    haptic(isCorrect ? 'success' : 'error')
    setWarmupCorrect(warmupCorrect + (isCorrect ? 1 : 0))
  }

  const proceedWarmup = () => {
    const newCorrect = warmupCorrect
    setWarmupAnswered(null)
    if (warmupStep + 1 < WARMUP_QUESTIONS.length) setWarmupStep(warmupStep + 1)
    else {
      const level: Difficulty = newCorrect === 0 ? 1 : newCorrect === 1 ? 2 : 3
      setWarmupLevel(level)
      setScreen('warmupResult')
    }
  }

  const s = getStyles(c)

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
      `}</style>

      {background === 'space' && <StarField />}

      {screen !== 'welcome' && (
        <div style={s.topControls}>
          <button style={s.toggleBtn} onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>{lang === 'ru' ? 'RU' : 'EN'}</button>
          <button style={s.toggleBtn} onClick={cycleBackground}>{BACKGROUND_ICON[background]}</button>
        </div>
      )}

      {screen === 'welcome' && (
        <div style={s.welcomeWrap}>
          <div style={s.welcomeEmoji}>🧠</div>
          <h1 style={s.welcomeTitle}>{t.welcomeTitle}</h1>
          <p style={s.welcomeSubtitle}>{t.welcomeSubtitle}</p>
          <button style={s.nextButton} onClick={() => { setWarmupStep(0); setWarmupCorrect(0); setWarmupAnswered(null); setScreen('warmup') }}>{t.start}</button>
        </div>
      )}

      {screen === 'warmup' && (
        <div className="screen-anim">
          <h1 style={s.title}>{t.warmupTitle}</h1>
          <p style={s.subtitle}>{t.warmupSubtitle}</p>
          <p style={s.question}>{WARMUP_QUESTIONS[warmupStep].question[lang]}</p>
          <div style={s.gridAnswers}>
            {WARMUP_QUESTIONS[warmupStep].options.map((opt) => {
              const isCorrectOption = opt === WARMUP_QUESTIONS[warmupStep].correct
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
                <div style={s.cardEmoji}>{TOPIC_EMOJI[key]}</div>
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
              <button key={key} style={s.cardSmall} onClick={() => { setSelectedDifficulty(key); if (selectedTopic) loadTask(selectedTopic, key) }}>
                <div style={s.cardEmoji}>{DIFFICULTY_EMOJI[key]}</div>
                <div style={s.cardLabel}>{t.difficulties[key]}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === 'task' && selectedTopic === 'differences' && diffBoard && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen('difficulty')}>{t.back}</button>
          <p style={{ ...s.subtitle, marginTop: '3rem', marginBottom: '1rem' }}>{t.found}: {diffFound.length} / {diffBoard.diffCount}</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${diffBoard.size}, 1fr)`, gap: '4px', maxWidth: '380px', margin: '0 auto' }}>
            {diffBoard.cells.map((emoji, i) => {
              const found = diffFound.includes(i)
              return <button key={i} className="diff-cell" style={{ fontSize: diffBoard.size === 8 ? '1.2rem' : diffBoard.size === 10 ? '1rem' : '0.85rem', borderColor: found ? GREEN : 'transparent', background: found ? 'rgba(34,197,94,0.12)' : 'transparent' }} onClick={() => tapDiffCell(i)}>{emoji}</button>
            })}
          </div>
          {answerResult && (<><p style={s.explanation}>{answerResult.explanation}</p><button style={s.nextButton} onClick={handleNext}>{t.nextTask}</button></>)}
        </div>
      )}

      {screen === 'task' && selectedTopic === 'reading' && task && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen('difficulty')}>{t.back}</button>
          {!readingHidden && !answerResult ? (
            <>
              <p style={{ ...s.question, marginTop: '3rem' }}>{task.passage}</p>
              <p style={{ fontSize: '0.78rem', color: c.textSecondary }}>{t.passageHiddenHint}</p>
            </>
          ) : (
            <>
              <p style={s.question}>{task.question}</p>
              <div style={s.gridAnswers}>
                {task.options.map((opt) => {
                  const isSelected = selectedAnswer === opt
                  const showResult = answerResult !== null
                  const isCorrectOption = showResult && opt === answerResult.correct_answer
                  let style = { ...s.cardAnswer }
                  if (showResult && isSelected && !isCorrectOption) style = s.cardWrong
                  else if (isCorrectOption) style = s.cardCorrect
                  return <button key={opt} style={style} disabled={selectedAnswer !== null} onClick={() => submitAnswer(opt)}>{opt}</button>
                })}
              </div>
              {answerResult && (<><p style={s.explanation}>{answerResult.explanation}</p><button style={s.nextButton} onClick={handleNext}>{t.nextTask}</button></>)}
            </>
          )}
        </div>
      )}

      {screen === 'task' && selectedTopic !== 'differences' && selectedTopic !== 'reading' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen('difficulty')}>{t.back}</button>
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
              <p style={{ ...s.question, color: task.isColorTask && !answerResult ? task.colorHex : c.text }}>
                {selectedTopic === 'memory' ? getMemoryQuestionText() : task.question}
              </p>
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
                    if (showResult && isSelected && !isCorrectOption) style = s.cardWrong
                    else if (isCorrectOption) style = s.cardCorrect
                    return <button key={opt} style={style} disabled={selectedAnswer !== null} onClick={() => submitAnswer(opt)}>{opt}</button>
                  })}
                </div>
              )}
              {answerResult && (<><p style={s.explanation}>{answerResult.explanation}</p><button style={s.nextButton} onClick={handleNext}>{t.nextTask}</button></>)}
            </>
          )}
        </div>
      )}

      {screen === 'summary' && selectedTopic && (
        <div className="screen-anim" style={s.welcomeWrap}>
          <div style={s.welcomeEmoji}>{topicStats[selectedTopic].correct === SERIES_LENGTH ? '🔥' : '💪'}</div>
          <h1 style={s.welcomeTitle}>{topicStats[selectedTopic].correct}/{SERIES_LENGTH} {t.correctOf}</h1>
          <p style={s.welcomeSubtitle}>{t.topics[selectedTopic]} — {t.seriesDone}</p>
          <button style={s.nextButton} onClick={continueAfterSummary}>{t.continueBtn}</button>
        </div>
      )}

      {screen === 'stats' && (
        <div className="screen-anim">
          <button style={s.backButton} onClick={() => setScreen(prevScreen)}>{t.back}</button>
          <h1 style={s.title}>{t.stats}</h1>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
            <button style={s.linkBtn} onClick={openAchievements}>🏅 {t.achievements}</button>
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
          <h1 style={s.title}>{t.achievements}</h1>
          {achievementsLoading ? <Skeleton height="70px" width="100%" bg={c.skeletonBg} /> : (
            <div style={s.achievementsGrid}>
              {ACHIEVEMENTS.map((a) => {
                const unlocked = unlockedAchievements.includes(a.id)
                return (
                  <div key={a.id} style={unlocked ? s.achievementCardUnlocked : s.achievementCardLocked}>
                    <div style={{ fontSize: '1.6rem', opacity: unlocked ? 1 : 0.3 }}>{a.emoji}</div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem', marginTop: '0.4rem' }}>{a.title[lang]}</div>
                    <div style={{ fontSize: '0.72rem', color: c.textSecondary, marginTop: '0.2rem' }}>{a.description[lang]}</div>
                  </div>
                )
              })}
            </div>
          )}
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
    page: { minHeight: '100vh', background: c.bg, color: c.text, fontFamily: '-apple-system, sans-serif', padding: '2.5rem 1.25rem', textAlign: 'center', position: 'relative', overflow: 'hidden' },
    topControls: { position: 'absolute', top: '1.75rem', right: '1.25rem', display: 'flex', gap: '0.5rem', zIndex: 2 },
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
    cardEmoji: { fontSize: '1.8rem' },
    cardLabel: { fontSize: '0.95rem', fontWeight: 500 },
    explanation: { marginTop: '1.75rem', color: c.textSecondary, fontSize: '0.88rem', maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5, position: 'relative', zIndex: 1 },
    nextButton: { marginTop: '1.75rem', background: NEON, border: 'none', borderRadius: '14px', padding: '0.85rem 1.5rem', color: '#fff', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', position: 'relative', zIndex: 1 },
    linkBtn: { background: 'transparent', border: `0.5px solid ${c.cardBorder}`, borderRadius: '12px', padding: '0.6rem 1rem', color: c.text, fontSize: '0.85rem', cursor: 'pointer' },
    statsWrap: { maxWidth: '380px', margin: '0 auto', position: 'relative', zIndex: 1 },
    streakRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1.75rem' },
    streakCard: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '16px', padding: '1.1rem 0.5rem' },
    streakValue: { fontSize: '1.2rem', fontWeight: 500, marginBottom: '0.3rem' },
    streakLabel: { fontSize: '0.78rem', color: c.textSecondary },
    categoryList: { display: 'flex', flexDirection: 'column', gap: '0.55rem' },
    categoryRow: { display: 'flex', justifyContent: 'space-between', background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '12px', padding: '0.8rem 1rem', fontSize: '0.9rem' },
    achievementsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', maxWidth: '380px', margin: '0 auto', position: 'relative', zIndex: 1 },
    achievementCardUnlocked: { background: 'rgba(77, 77, 255, 0.1)', border: `0.5px solid ${NEON}`, borderRadius: '16px', padding: '1rem 0.75rem' },
    achievementCardLocked: { background: c.cardBg, border: `0.5px solid ${c.cardBorder}`, borderRadius: '16px', padding: '1rem 0.75rem', opacity: 0.6 },
  }
}

export default App
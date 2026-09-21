// Единая точка входа: создаёт задание для любой мини-игры.
import type { GameTask, GameTopic, Level } from './gametypes'
import { generateMemory, MEMORY_KINDS } from './game-memory'
import { generateAttention, ATTENTION_KINDS } from './game-attention'
import { generateLogic, LOGIC_KINDS } from './game-logic'
import { generateMath, MATH_KINDS } from './game-math'
import { generateSpeed, SPEED_KINDS } from './game-speed'
import { generateColors, COLORS_KINDS } from './game-colors'
import { generateWords, WORDS_KINDS } from './game-words'

export const GAME_TOPICS: GameTopic[] = ['memory', 'attention', 'logic', 'math', 'speed', 'colors', 'words']

export function isGameTopic(t: string): t is GameTopic {
  return (GAME_TOPICS as string[]).includes(t)
}

export function generateGame(topic: GameTopic, level: Level): GameTask {
  switch (topic) {
    case 'memory': return generateMemory(level)
    case 'attention': return generateAttention(level)
    case 'logic': return generateLogic(level)
    case 'math': return generateMath(level)
    case 'speed': return generateSpeed(level)
    case 'colors': return generateColors(level)
    default: return generateWords(level)
  }
}

export const KIND_LABELS: Record<GameTopic, Record<string, string>> = {
  memory: MEMORY_KINDS,
  attention: ATTENTION_KINDS,
  logic: LOGIC_KINDS,
  math: MATH_KINDS,
  speed: SPEED_KINDS,
  colors: COLORS_KINDS,
  words: WORDS_KINDS,
}

export function gameKindLabel(topic: GameTopic, kind: string): string {
  return KIND_LABELS[topic]?.[kind] ?? kind
}
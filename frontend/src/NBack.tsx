// Игра «N-назад» (тренажёр рабочей памяти).
// Клетки сетки загораются по одной. Игрок жмёт «Совпало!», если горит та же клетка,
// что n шагов назад. В конце считаем пойманные совпадения и лишние нажатия.

import { useEffect, useRef, useState } from 'react'

type Props = {
  n: number
  size: number
  sequence: number[]
  stepMs: number
  colors: { cardBg: string; cardBorder: string; text: string; textSecondary: string }
  accent: string
  good: string
  bad: string
  onFinish: (isCorrect: boolean, detail: string) => void
  onTick?: (step: number) => void
}

export default function NBackGame({ n, size, sequence, stepMs, colors, accent, good, bad, onFinish, onTick }: Props) {
  const [step, setStep] = useState(-1)
  const [lit, setLit] = useState(false)
  const [feedback, setFeedback] = useState<'hit' | 'false' | null>(null)
  const [done, setDone] = useState(false)
  const pressedRef = useRef(false)
  const stepRef = useRef(-1)
  const statsRef = useRef({ hits: 0, misses: 0, falseAlarms: 0 })
  const finishRef = useRef(onFinish)
  const tickRef = useRef(onTick)
  finishRef.current = onFinish
  tickRef.current = onTick

  const isTarget = (i: number) => i >= n && sequence[i] === sequence[i - n]
  const targets = sequence.filter((_, i) => isTarget(i)).length

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const prev = stepRef.current
      if (prev >= 0 && isTarget(prev) && !pressedRef.current) statsRef.current.misses++
      const next = prev + 1
      if (next >= sequence.length) {
        setLit(false)
        setDone(true)
        const { hits, falseAlarms } = statsRef.current
        const need = Math.max(1, Math.ceil(targets * 0.6))
        const ok = targets === 0 ? falseAlarms === 0 : hits - falseAlarms >= need
        finishRef.current(ok, `Совпадений поймано: ${hits} из ${targets}, лишних нажатий: ${falseAlarms}.`)
        return
      }
      stepRef.current = next
      pressedRef.current = false
      setFeedback(null)
      setStep(next)
      setLit(true)
      tickRef.current?.(next)
      timers.push(setTimeout(() => { if (!cancelled) setLit(false) }, stepMs * 0.7))
      timers.push(setTimeout(tick, stepMs))
    }
    timers.push(setTimeout(tick, 900))
    return () => { cancelled = true; timers.forEach(clearTimeout) }
    // Игра запускается один раз при появлении задания
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const press = () => {
    const i = stepRef.current
    if (done || i < 0 || pressedRef.current) return
    pressedRef.current = true
    if (isTarget(i)) {
      statsRef.current.hits++
      setFeedback('hit')
    } else {
      statsRef.current.falseAlarms++
      setFeedback('false')
    }
  }

  const current = step >= 0 ? sequence[step] : -1
  const border = feedback === 'hit' ? good : feedback === 'false' ? bad : colors.cardBorder

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div data-nback-grid style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: '8px', maxWidth: '260px', margin: '0 auto 1rem' }}>
        {Array.from({ length: size * size }, (_, i) => (
          <div key={i} style={{
            aspectRatio: '1', borderRadius: '14px',
            background: lit && i === current ? accent : colors.cardBg,
            border: `0.5px solid ${lit && i === current ? border : colors.cardBorder}`,
            transition: 'background 0.12s ease',
          }} />
        ))}
      </div>
      <p style={{ fontSize: '0.78rem', color: colors.textSecondary, margin: '0 0 0.75rem' }}>
        {step < 0 ? 'Приготовься…' : done ? 'Готово!' : `Шаг ${step + 1} из ${sequence.length}`}
      </p>
      <button
        onClick={press}
        disabled={done || step < 0}
        style={{
          width: '100%', maxWidth: '320px', padding: '1rem', borderRadius: '16px', fontSize: '1.05rem', fontWeight: 600,
          border: `1.5px solid ${border}`, color: colors.text, cursor: done ? 'default' : 'pointer',
          background: feedback === 'hit' ? 'rgba(34,197,94,0.18)' : feedback === 'false' ? 'rgba(239,68,68,0.18)' : colors.cardBg,
          opacity: done ? 0.6 : 1,
        }}
      >
        {feedback === 'hit' ? '✅ Есть!' : feedback === 'false' ? '❌ Не совпало' : '🎯 Совпало!'}
      </button>
    </div>
  )
}
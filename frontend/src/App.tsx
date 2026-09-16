import { useEffect, useState } from 'react'

function App() {
  const [status, setStatus] = useState<string>('Проверяю связь с сервером...')

  useEffect(() => {
    fetch('https://neyronych-app.onrender.com/api/ping')
      .then((res) => res.json())
      .then((data) => {
        setStatus(data.pong ? '✅ Связь с сервером есть!' : '❌ Сервер ответил, но что-то не так')
      })
      .catch(() => {
        setStatus('❌ Не удалось связаться с сервером')
      })
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>🧠 Нейроныч</h1>
      <p>{status}</p>
    </div>
  )
}

export default App
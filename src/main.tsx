import { Component, StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { StoreProvider } from './lib/store'
import { registerServiceWorker } from './lib/updates'
import './styles.css'

/*
 * Страницу нельзя показывать в чужом фрейме: заголовок frame-ancestors на
 * GitHub Pages не выставить, а в приложении есть необратимые кнопки —
 * «Отключить», «Очистить всё», «Пригласить».
 */
if (window.top !== window.self) {
  window.top!.location.href = window.self.location.href
}

/**
 * Последний рубеж: если что-то всё-таки упало на рендере, человек видит
 * не белый экран без выхода, а объяснение и две кнопки. Особенно важно
 * в установленном PWA — там нет адресной строки, чтобы уйти со сломанной страницы.
 */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: '48px 24px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 12 }}>Что-то сломалось</h2>
        <p style={{ color: '#8d8175', fontSize: 14, marginBottom: 20 }}>
          {String(this.state.error?.message ?? this.state.error)}
        </p>
        <button
          style={{ padding: '12px 20px', marginRight: 10, borderRadius: 12, border: '1px solid #d8cbb8', background: '#fff', cursor: 'pointer' }}
          onClick={() => window.location.reload()}
        >
          Перезагрузить
        </button>
        <button
          style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #d8cbb8', background: '#fff', cursor: 'pointer' }}
          onClick={() => {
            // Локальная копия могла испортиться — база вернётся с Диска при следующем входе.
            localStorage.removeItem('wtc.db.v1')
            window.location.reload()
          }}
        >
          Сбросить локальную копию
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <HashRouter>
        <StoreProvider>
          <App />
        </StoreProvider>
      </HashRouter>
    </Boundary>
  </StrictMode>,
)

// Регистрируем service worker — приложение должно открываться и без сети.
if (import.meta.env.PROD) {
  registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`)
}

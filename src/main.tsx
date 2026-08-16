import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { StoreProvider } from './lib/store'
import { registerServiceWorker } from './lib/updates'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  </StrictMode>,
)

// Регистрируем service worker — приложение должно открываться и без сети.
if (import.meta.env.PROD) {
  registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`)
}

import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './lib/store'
import { ToastHost } from './components/ui'
import { IdentityPrompt } from './components/IdentityPrompt'
import { applyUpdate, onUpdateReady } from './lib/updates'
import { IconCalendar, IconFridge, IconHome, IconList, IconMore } from './components/Icons'
import { Today } from './pages/Today'
import { Recipes } from './pages/Recipes'
import { RecipeDetail } from './pages/RecipeDetail'
import { CalendarPage } from './pages/Calendar'
import { Plan } from './pages/Plan'
import { More } from './pages/More'
import { Stats } from './pages/Stats'
import { Products } from './pages/Products'
import { Fridge } from './pages/Fridge'
import { SettingsPage } from './pages/Settings'
import { classNames } from './lib/util'
import { fridgeNeedsReview } from './lib/fridge'

const TABS = [
  { to: '/', label: 'Сегодня', Icon: IconHome, end: true },
  { to: '/plan', label: 'Неделя', Icon: IconList, end: false },
  { to: '/calendar', label: 'Календарь', Icon: IconCalendar, end: false },
  { to: '/fridge', label: 'Дома', Icon: IconFridge, end: false },
  { to: '/more', label: 'Ещё', Icon: IconMore, end: false },
]

export function App() {
  const { db, needsIdentity } = useStore()
  const fridgeAlert = fridgeNeedsReview(db)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => onUpdateReady(setUpdateReady), [])

  // Тема применяется к корню документа, чтобы её видели и портальные окна.
  useEffect(() => {
    const apply = () => {
      const preference = db.settings.theme
      const dark =
        preference === 'dark' ||
        (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      // Чтобы строка состояния на Android совпадала с выбранной в приложении темой.
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
        meta.setAttribute('content', dark ? '#1a1714' : '#faf7f2')
        meta.removeAttribute('media')
      }
    }
    apply()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [db.settings.theme])

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/fridge" element={<Fridge />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/stats" element={<Stats />} />
        <Route path="/more/products" element={<Products />} />
        <Route path="/more/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <nav className="tabbar">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => classNames(isActive && 'active')}>
            <Icon size={20} />
            {to === '/fridge' && fridgeAlert && <span className="tab-dot" />}
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {updateReady && (
        <div className="update-bar">
          <span className="grow">Вышло обновление приложения</span>
          <button className="btn btn-sm btn-primary" onClick={applyUpdate}>
            Обновить
          </button>
        </div>
      )}

      {needsIdentity && <IdentityPrompt />}

      <ToastHost />
    </div>
  )
}

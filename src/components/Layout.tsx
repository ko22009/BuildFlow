import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { ThemeToggle } from './ThemeToggle'

export function Layout() {
  const { profile, signOut } = useAuth()
  if (!profile) return null
  const isManager = profile.role === 'manager'
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">BuildFlow</span>
          <nav>
            {!isManager ? <NavLink to="/my">Мои задачи</NavLink> : null}
            <NavLink to="/objects">Объекты</NavLink>
            {isManager ? <NavLink to="/tasks">Все задачи</NavLink> : null}
            {isManager ? <NavLink to="/trash">Корзина</NavLink> : null}
          </nav>
          <div className="user">
            <ThemeToggle />
            <span>
              {profile.full_name}
              <small>{isManager ? 'менеджер' : 'исполнитель'}</small>
            </span>
            <button className="btn ghost" onClick={() => void signOut()}>
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}

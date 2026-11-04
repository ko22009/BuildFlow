import { Loader } from './components/Loader'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { ObjectPage } from './pages/ObjectPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { TaskPage } from './pages/TaskPage'
import { TasksPage } from './pages/TasksPage'
import { TrashPage } from './pages/TrashPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth()
  if (loading) return <Loader fullScreen />
  if (!session || !profile) return <Navigate to="/login" replace />
  return children
}

function Home() {
  const { profile } = useAuth()
  return <Navigate to={profile?.role === 'executor' ? '/my' : '/objects'} replace />
}

function ManagerOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (profile?.role !== 'manager') return <Navigate to="/" replace />
  return children
}

// «Мои задачи» это экран исполнителя. Менеджеру там делать нечего: у него есть «Все задачи».
function ExecutorOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (profile?.role === 'manager') return <Navigate to="/tasks" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Home />} />
            <Route
              path="/my"
              element={
                <ExecutorOnly>
                  <TasksPage mine />
                </ExecutorOnly>
              }
            />
            <Route
              path="/tasks"
              element={
                <ManagerOnly>
                  <TasksPage />
                </ManagerOnly>
              }
            />
            <Route
              path="/trash"
              element={
                <ManagerOnly>
                  <TrashPage />
                </ManagerOnly>
              }
            />
            <Route path="/objects" element={<ObjectsPage />} />
            <Route path="/objects/:id" element={<ObjectPage />} />
            <Route path="/tasks/:id" element={<TaskPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

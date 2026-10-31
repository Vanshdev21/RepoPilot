import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')

  useEffect(() => {
    let active = true
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(response => { if (active) setState(response.ok ? 'authenticated' : 'unauthenticated') })
      .catch(() => { if (active) setState('unauthenticated') })
    return () => { active = false }
  }, [])

  if (state === 'checking') return <main className="route-loading"><span className="loading-pulse"/>Checking GitHub session…</main>
  if (state === 'unauthenticated') return <Navigate to="/login" replace />
  return children
}

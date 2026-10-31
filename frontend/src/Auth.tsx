import { useEffect, useState } from 'react'
import { GitBranch, Code2, LockKeyhole, Mail } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'

export function LoginPage() {
  return <AuthPage mode="login" />
}

export function SignupPage() {
  return <AuthPage mode="signup" />
}

function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'
  const [email, setEmail] = useState('')
  const [sessionState, setSessionState] = useState<'checking' | 'guest' | 'authenticated'>('checking')
  const oauthError = new URLSearchParams(window.location.search).get('message')

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(response => setSessionState(response.ok ? 'authenticated' : 'guest'))
      .catch(() => setSessionState('guest'))
  }, [])

  if (sessionState === 'checking') return <main className="route-loading"><span className="loading-pulse"/>Checking GitHub session…</main>
  if (sessionState === 'authenticated') return <Navigate to="/dashboard" replace />

  return <main className="auth-page">
    <section className="auth-panel">
      <Link className="brand" to="/"><span className="brandmark"><GitBranch size={17}/></span>RepoPilot<small>v2.4</small></Link>
      <div className="auth-copy">
        {oauthError && <div className="workspace-message" role="alert">GitHub sign-in failed: {oauthError}</div>}
        <span className="eyebrow">SECURE CONTRIBUTOR ACCESS</span>
        <h1>{signup ? 'Start shipping better fixes.' : 'Welcome back, engineer.'}</h1>
        <p>{signup ? 'Connect your GitHub identity and turn an issue into an evidence-backed pull request.' : 'Continue investigating repositories, patches, and verified engineering runs.'}</p>
      </div>
      <a className="github-auth" href={`${API}/auth/github`}><Code2 size={18}/> {signup ? 'Sign up with GitHub' : 'Continue with GitHub'}</a>
      <div className="auth-divider"><span>GitHub handles identity & permissions</span></div>
      <label><Mail size={15}/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Work email" aria-label="Work email" /></label>
      <button className="button primary auth-submit" disabled={!email.includes('@')}><LockKeyhole size={15}/>{signup ? 'Request account access' : 'Continue with email'}</button>
      <p className="auth-switch">{signup ? 'Already have an account?' : 'New to RepoPilot?'} <Link to={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create account'}</Link></p>
    </section>
    <aside className="auth-proof">
      <div className="auth-grid"><span>01</span><b>Repository context</b><p>Inspect only the files relevant to a selected issue.</p></div>
      <div className="auth-grid"><span>02</span><b>Patch verification</b><p>Run actual tests in isolated execution environments.</p></div>
      <div className="auth-grid"><span>03</span><b>Human approval</b><p>Your explicit review is required before publishing.</p></div>
      <div className="auth-orbit"><GitBranch/><i/><i/><i/></div>
    </aside>
  </main>
}

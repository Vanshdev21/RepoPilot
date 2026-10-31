import { Link } from 'react-router-dom'
import { Activity, BookOpen, GitBranch, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'

export default function WorkspaceLayout({ children, title }: { children: React.ReactNode; title: string }) {
  async function logout() {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined)
    window.location.assign('/')
  }
  return <div className="app-shell">
    <aside className="sidebar"><Link className="brand" to="/"><span className="brandmark"><GitBranch size={17}/></span>RepoPilot</Link>
      <nav><Link to="/dashboard"><LayoutDashboard/>Overview</Link><Link to="/workspace"><GitBranch/>Workspace</Link><Link to="/runs"><Activity/>Agent runs</Link><Link to="/reports"><BookOpen/>Reports</Link></nav>
      <div className="sidebar-status"><i/> SYSTEM HEALTHY</div>
    </aside>
    <main className="workspace-main"><header className="workspace-header"><span>REPOPILOT / {title}</span><div className="account-actions"><a href={`${API}/auth/github`}><ShieldCheck size={15}/>Relink GitHub</a><button onClick={logout}><LogOut size={15}/>Log out</button></div></header>{children}</main>
  </div>
}

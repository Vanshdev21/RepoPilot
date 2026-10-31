import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { Activity, ArrowRight, BookOpen, Bot, GitBranch, Send } from 'lucide-react'
import WorkspaceLayout from '../layouts/WorkspaceLayout'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'

export default function Dashboard() {
  const [repositories, setRepositories] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [repositoryId, setRepositoryId] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<any[]>([{ role: 'assistant', content: 'Ask me about this repository’s architecture, tech stack, files, or implementation.' }])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all(['/repositories','/github/repos','/agent/runs','/reports'].map(path => fetch(`${API}${path}`, { credentials: 'include' }).then(response => response.json())))
      .then(([connected, github, runData, reportData]) => {
        setRepositories(connected.success ? connected.data : github.success ? github.data : [])
        if (runData.success) setRuns(runData.data)
        if (reportData.success) setReports(reportData.data)
      })
      .catch(() => undefined)
    gsap.from('.dash-card', { y: 18, opacity: 1, duration: .55, stagger: .08, clearProps: 'transform' })
  }, [])

  async function ask(event: React.FormEvent) {
    event.preventDefault()
    if (!repositoryId || !question.trim() || loading) return
    const repository = repositories.find(item => String(item._id || item.githubRepositoryId || item.id) === repositoryId)
    if (!repository?._id) return
    const userQuestion = question.trim()
    setMessages(items => [...items, { role: 'user', content: userQuestion }])
    setQuestion(''); setLoading(true)
    try {
      const response = await fetch(`${API}/chat/repository`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repositoryId: repository._id, question: userQuestion, history: messages }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || 'Repository assistant failed')
      setMessages(items => [...items, { role: 'assistant', content: body.data.answer, sources: body.data.sources }])
    } catch (error: any) { setMessages(items => [...items, { role: 'assistant', content: error.message, error: true }]) }
    finally { setLoading(false) }
  }

  const passed = runs.filter(run => run.testResults?.status === 'passed').length
  const published = runs.filter(run => run.status === 'published').length
  return <WorkspaceLayout title="OVERVIEW"><div className="dashboard">
    <div className="dashboard-title"><div><span className="eyebrow">COMMAND CENTER</span><h1>Engineering overview</h1></div><Link className="button primary" to="/workspace">New investigation <ArrowRight size={15}/></Link></div>
    <div className="metric-grid"><article className="dash-card"><span>CONNECTED REPOS</span><b>{repositories.length}</b><small>GitHub projects</small></article><article className="dash-card"><span>AGENT RUNS</span><b>{String(runs.length).padStart(2,'0')}</b><small>{runs.length ? `${runs.length} executions` : 'Ready when you are'}</small></article><article className="dash-card"><span>PATCHES VERIFIED</span><b>{String(passed).padStart(2,'0')}</b><small>{reports.length ? `${reports.length} evidence reports` : 'Docker pending'}</small></article><article className="dash-card"><span>PULL REQUESTS</span><b>{String(published).padStart(2,'0')}</b><small>Human approved only</small></article></div>
    <section className="activity-panel dash-card"><div className="panel-title">YOUR GITHUB PROJECTS</div>{repositories.length ? repositories.map(repository => <Link className="activity-row" to="/workspace" key={repository._id || repository.githubRepositoryId || repository.id}><span><GitBranch size={15}/></span><div><b>{repository.fullName}</b><small>{repository.description || 'Connected repository'}</small></div><em>{repository.primaryLanguage || repository.language || 'GitHub'}</em><ArrowRight size={16}/></Link>) : <div className="activity-empty">Connect a repository to begin.</div>}</section>
    <section className="repository-chat dash-card"><div className="chat-heading"><div className="chat-icon"><Bot/></div><div><span>REPOSITORY COPILOT</span><b>Ask about your codebase</b></div><i>AI ONLINE</i></div><div className="chat-repository-row"><label>Repository<select value={repositoryId} onChange={event => setRepositoryId(event.target.value)}><option value="">Choose a repository</option>{repositories.map(repository => <option key={repository._id || repository.id} value={String(repository._id || repository.githubRepositoryId || repository.id)}>{repository.fullName}</option>)}</select></label><button onClick={() => setQuestion('Explain this repository’s tech stack and architecture.')}>Explain tech stack</button></div><div className="chat-messages">{messages.map((message,index) => <div className={`chat-message ${message.role} ${message.error ? 'error' : ''}`} key={index}><span>{message.role === 'assistant' ? <Bot size={15}/> : 'YOU'}</span><p>{message.content}</p>{message.sources?.length > 0 && <small>Context: {message.sources.join(', ')}</small>}</div>)}{loading && <div className="chat-message assistant thinking"><span><Bot size={15}/></span><p>Investigating repository context…</p></div>}</div><form className="chat-composer" onSubmit={ask}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about a function, architecture, dependencies…" disabled={!repositoryId || loading}/><button disabled={!repositoryId || !question.trim() || loading}><Send size={16}/></button></form></section>
    <div className="dashboard-actions"><Link className="quick-action" to="/runs"><Activity/><div><b>Agent runs</b><small>Review investigations and execution activity</small></div><ArrowRight/></Link><Link className="quick-action" to="/reports"><BookOpen/><div><b>Evidence reports</b><small>Inspect Docker and patch verification</small></div><ArrowRight/></Link></div>
  </div></WorkspaceLayout>
}

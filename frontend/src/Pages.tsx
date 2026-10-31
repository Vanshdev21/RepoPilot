import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { Activity, ArrowRight, BookOpen, Bot, CheckCircle2, GitBranch, LayoutDashboard, LogOut, Send, ShieldCheck } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'

export function WorkspaceLayout({children,title}:{children:any,title:string}){
 const logout = async () => { await fetch(`${API}/auth/logout`, { method:'POST', credentials:'include' }).catch(()=>undefined); window.location.assign('/') }
 return <div className="app-shell"><aside className="sidebar"><Link className="brand" to="/"><span className="brandmark"><GitBranch size={17}/></span>RepoPilot</Link><nav><Link to="/dashboard"><LayoutDashboard/>Overview</Link><Link to="/workspace"><GitBranch/>Workspace</Link><Link to="/runs"><Activity/>Agent runs</Link><Link to="/reports"><BookOpen/>Reports</Link></nav><div className="sidebar-status"><i/> SYSTEM HEALTHY</div></aside><main className="workspace-main"><header className="workspace-header"><span>REPOPILOT / {title}</span><div className="account-actions"><a href={`${API}/auth/github`}><ShieldCheck size={15}/>Relink GitHub</a><button onClick={logout}><LogOut size={15}/>Log out</button></div></header>{children}</main></div>
}

export function Dashboard() {
  const [repositories, setRepositories] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [chatRepository, setChatRepository] = useState('')
  const [chatQuestion, setChatQuestion] = useState('')
  const [chatMessages, setChatMessages] = useState<any[]>([{ role: 'assistant', content: 'Ask me about this repository’s architecture, tech stack, files, or implementation.' }])
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    const loadDashboard = async () => {
      const responses = await Promise.all([
        fetch(`${API}/repositories`, { credentials: 'include' }),
        fetch(`${API}/github/repos`, { credentials: 'include' }),
        fetch(`${API}/agent/runs`, { credentials: 'include' }),
        fetch(`${API}/reports`, { credentials: 'include' }),
      ])
      const [connectedResponse, githubResponse, runsResponse, reportsResponse] = await Promise.all(responses.map(response => response.json()))
      setRepositories(connectedResponse.success ? connectedResponse.data : [])
      if (!connectedResponse.success && githubResponse.success) setRepositories(githubResponse.data.map((repository: any) => repository))
      if (runsResponse.success) setRuns(runsResponse.data)
      if (reportsResponse.success) setReports(reportsResponse.data)
    }
    loadDashboard().catch(() => undefined)
    gsap.fromTo('.dash-card', { y: 24, opacity: 1 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.08, ease: 'power3.out', clearProps: 'transform,opacity' })
  }, [])

  async function askRepository(event: React.FormEvent) {
    event.preventDefault()
    if (!chatRepository || !chatQuestion.trim() || chatLoading) return
    const repository = repositories.find(item => String(item._id || item.githubRepositoryId || item.id) === chatRepository)
    const repositoryId = repository?._id
    if (!repositoryId) return
    const question = chatQuestion.trim()
    setChatMessages(messages => [...messages, { role: 'user', content: question }])
    setChatQuestion('')
    setChatLoading(true)
    try {
      const response = await fetch(`${API}/chat/repository`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repositoryId, question, history: chatMessages }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || 'The repository assistant could not answer')
      setChatMessages(messages => [...messages, { role: 'assistant', content: body.data.answer, sources: body.data.sources }])
    } catch (error: any) {
      setChatMessages(messages => [...messages, { role: 'assistant', content: error.message, error: true }])
    } finally { setChatLoading(false) }
  }

  const passedRuns = runs.filter(run => run.testResults?.status === 'passed').length
  const pullRequests = runs.filter(run => run.status === 'published').length

  return <WorkspaceLayout title="OVERVIEW">
    <div className="dashboard">
      <div className="dashboard-title">
        <div><span className="eyebrow">COMMAND CENTER</span><h1>Engineering overview</h1></div>
        <Link className="button primary" to="/workspace">New investigation <ArrowRight size={15}/></Link>
      </div>
      <div className="metric-grid">
        <article className="dash-card"><span>CONNECTED REPOS</span><b>{repositories.length}</b><small>GitHub projects</small></article>
        <article className="dash-card"><span>AGENT RUNS</span><b>{String(runs.length).padStart(2, '0')}</b><small>{runs.length ? `${runs.length} executions` : 'Ready when you are'}</small></article>
        <article className="dash-card"><span>PATCHES VERIFIED</span><b>{String(passedRuns).padStart(2, '0')}</b><small>{reports.length ? `${reports.length} evidence reports` : 'Docker pending'}</small></article>
        <article className="dash-card"><span>PULL REQUESTS</span><b>{String(pullRequests).padStart(2, '0')}</b><small>Human approved only</small></article>
      </div>
      <section className="activity-panel dash-card">
        <div className="panel-title">YOUR GITHUB PROJECTS</div>
        {repositories.length ? repositories.map(repository => <Link className="activity-row" to="/workspace" key={repository.githubRepositoryId || repository.id || repository._id}>
          <span><GitBranch size={15}/></span><div><b>{repository.fullName}</b><small>{repository.description || 'Connected repository'}</small></div><em>{repository.primaryLanguage || repository.language || 'GitHub'}</em><ArrowRight size={16}/>
        </Link>) : <div className="activity-empty">Connect a repository to begin.</div>}
      </section>
      <section className="repository-chat dash-card">
        <div className="chat-heading"><div className="chat-icon"><Bot size={20}/></div><div><span>REPOSITORY COPILOT</span><b>Ask about your codebase</b></div><i>AI ONLINE</i></div>
        <div className="chat-repository-row"><label>Repository<select value={chatRepository} onChange={event => setChatRepository(event.target.value)}><option value="">Choose a repository</option>{repositories.map(repository => { const id = String(repository._id || repository.githubRepositoryId || repository.id); return <option key={id} value={id}>{repository.fullName}</option> })}</select></label><button type="button" onClick={() => { setChatQuestion('Explain this repository’s tech stack and architecture.'); }}>Explain tech stack</button></div>
        <div className="chat-messages">{chatMessages.map((message, index) => <div className={`chat-message ${message.role} ${message.error ? 'error' : ''}`} key={index}><span>{message.role === 'assistant' ? <Bot size={15}/> : 'YOU'}</span><p>{message.content}</p>{message.sources?.length > 0 && <small>Context: {message.sources.slice(0, 4).join(', ')}</small>}</div>)}{chatLoading && <div className="chat-message assistant thinking"><span><Bot size={15}/></span><p>Investigating repository context…</p></div>}</div>
        <form className="chat-composer" onSubmit={askRepository}><input value={chatQuestion} onChange={event => setChatQuestion(event.target.value)} placeholder="Ask about a function, architecture, dependencies…" disabled={!chatRepository || chatLoading}/><button type="submit" disabled={!chatRepository || !chatQuestion.trim() || chatLoading} aria-label="Send question"><Send size={16}/></button></form>
      </section>
      <div className="dashboard-actions">
        <Link className="quick-action" to="/runs"><Activity/><div><b>Agent runs</b><small>Review investigation and execution activity</small></div><ArrowRight/></Link>
        <Link className="quick-action" to="/reports"><BookOpen/><div><b>Evidence reports</b><small>Inspect Docker and patch verification</small></div><ArrowRight/></Link>
      </div>
    </div>
  </WorkspaceLayout>
}
export function Workspace(){
  const [url, setUrl] = useState('https://github.com/vercel/next.js')
  const [repository, setRepository] = useState<any>(null)
  const [issues, setIssues] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [run, setRun] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [githubRepositories, setGithubRepositories] = useState<any[]>([])
  useEffect(() => {
    fetch(`${API}/github/repos`, { credentials: 'include' })
      .then(response => response.json())
      .then(body => { if (body.success) setGithubRepositories(body.data) })
      .catch(() => undefined)
  }, [])
  const request = async (path:string, options?:RequestInit) => {
    const response = await fetch(`${API}${path}`, {...options, credentials:'include', headers:{'Content-Type':'application/json', ...options?.headers}})
    const body = await response.json()
    if (!response.ok) throw new Error(body.error?.message || 'Request failed')
    return body.data
  }
  async function selectGithubRepository(fullName:string) {
    const repositoryUrl = `https://github.com/${fullName}`
    setUrl(repositoryUrl)
    await connectRepository(repositoryUrl)
  }
  async function connectRepository(repositoryUrl = url) {
    setBusy(true); setMessage('Connecting repository...')
    try {
      const connected = await request('/repositories/connect', { method:'POST', body:JSON.stringify({repositoryUrl}) })
      setRepository(connected)
      const issueList = await request(`/repositories/${connected._id}/issues?perPage=10`)
      setIssues(issueList)
      setMessage(`${connected.fullName} connected`)
    } catch (error:any) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function executeRunAction(action: string) {
    if (!run) return
    setBusy(true)
    try {
      const result = await request(`/agent/${run._id}/${action}`, { method:'POST' })
      setRun(result.runId ? {...run, approvalState:'approved', status:'approved'} : result)
      setMessage(action === 'test' ? 'Docker validation complete' : action === 'approve' ? 'Patch approved' : 'Pull request prepared')
    } catch (error:any) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function enableIssueAgent(autoApprove = false) {
    if (!repository) return;
    setBusy(true)
    try {
      await request(`/repositories/${repository._id}/monitor`, { method:'POST', body:JSON.stringify({autoApprove}) })
      setMessage(autoApprove ? 'Issue agent enabled and Docker-verified PR publishing enabled' : 'Automatic issue monitoring enabled — patches still require approval')
    } catch (error:any) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function analyzeIssue() {
    if (!repository || !selected) return
    setBusy(true)
    try {
      const result = await request('/agent/analyze', { method:'POST', body:JSON.stringify({repositoryId:repository._id, issueNumber:selected.number}) })
      setRun(result)
      setMessage('Investigation complete')
    } catch (error:any) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <WorkspaceLayout title="WORKSPACE"><div className="workspace-page">
    <div className="dashboard-title"><div><span className="eyebrow">ISSUE-TO-PR</span><h1>Repository workspace</h1></div></div>
    <label className="repo-search"><GitBranch/><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="github.com/owner/repository"/><button className="button primary" onClick={() => connectRepository()} disabled={busy}>{busy?'Working...':'Connect repository'} <ArrowRight size={15}/></button></label>
    {repository && <div className="monitor-actions"><button className="button ghost" disabled={busy} onClick={()=>enableIssueAgent(false)}>Enable issue agent</button><button className="button primary" disabled={busy} onClick={()=>enableIssueAgent(true)}>Enable verified auto PR</button></div>}
    {githubRepositories.length > 0 && <div className="github-projects"><div className="panel-title">YOUR GITHUB REPOSITORIES</div><div>{githubRepositories.map(item=><button key={item.id} onClick={()=>selectGithubRepository(item.fullName)}><b>{item.fullName}</b><span>{item.private ? 'private' : 'public'} · {item.language || 'Other'}</span></button>)}</div></div>}
    {message && <div className="workspace-message">{message}</div>}
    <div className="workspace-columns">
      <section><div className="panel-title">OPEN ISSUES <small>{issues.length} visible</small></div>{repository && <div className="connected-repository"><GitBranch size={15}/><b>{repository.fullName}</b></div>}{issues.length > 0 ? issues.map(issue=><button key={issue.number} onClick={()=>setSelected(issue)} className={`issue-picker ${selected?.number===issue.number?'selected':''}`}><span>#{issue.number}</span><b>{issue.title}</b><small>{issue.labels[0] || 'issue'}</small></button>) : <div className="empty-investigation compact"><GitBranch/><b>{repository ? 'No open issues found' : 'Choose a repository'}</b><p>{repository ? 'This repository is connected. Create or open a GitHub issue to start an AI investigation.' : 'Select one of your GitHub repositories to load its issues.'}</p></div>}</section>
      <section><div className="panel-title">AI INVESTIGATION</div>{run ? <div className="run-result"><span>{run.classification}</span>{run.confidence != null && <small className="run-confidence">AI confidence: {run.confidence}%</small>}<h2>{run.summary}</h2><p>{run.rootCause}</p>{run.validationNotes && <div className="validation-notes"><b>Agent validation</b><p>{run.validationNotes}</p></div>}{run.status === 'not_actionable' ? <div className="workspace-message">No safe code change was generated. RepoPilot did not modify this repository or open a pull request.</div> : <>{run.relevantFiles.map((file:string)=><code key={file}>{file}</code>)}<div className="agent-actions"><button className="button ghost" disabled={busy} onClick={()=>executeRunAction('test')}>Run Docker tests</button><button className="button ghost" disabled={busy || run.testResults?.status !== 'passed'} onClick={()=>executeRunAction('approve')}>Approve patch</button><button className="button primary" disabled={busy || run.approvalState !== 'approved'} onClick={()=>executeRunAction('pull-request')}>Open pull request</button></div></>}</div> : <div className="empty-investigation"><Activity/><b>{selected ? selected.title : 'Select an issue to begin'}</b><p>{selected ? 'Repository context is ready for the AI investigation.' : 'RepoPilot will identify relevant files, formulate a hypothesis, and generate a reviewable patch.'}</p>{selected && <button className="button primary" onClick={analyzeIssue}>Run AI investigation <ArrowRight size={15}/></button>}</div>}</section>
    </div>
  </div></WorkspaceLayout>
}

export function Runs() {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/agent/runs`, { credentials: 'include' })
      .then(response => response.json())
      .then(body => { if (body.success) setRuns(body.data) })
      .finally(() => setLoading(false))
  }, [])

  return <WorkspaceLayout title="AGENT RUNS">
    <div className="inner-page"><span className="eyebrow">EXECUTION STREAM</span><h1>Agent runs</h1>
      {loading && <div className="loading-state">Loading agent activity…</div>}
      {!loading && runs.length === 0 && <div className="empty-investigation"><Activity/><b>No agent runs yet</b><p>Connect a repository, select an issue, and run an AI investigation.</p><Link className="button primary" to="/workspace">Open workspace</Link></div>}
      {runs.map(run => <article className="run-card" key={run._id}><span>{run._id}</span><div><b>{run.summary || run.issueSnapshot?.title}</b><small>{run.repositoryId ? `Issue #${run.issueNumber}` : 'Repository investigation'}</small></div><em className={run.status === 'failed' ? 'failed' : ''}>{run.status?.replaceAll('_', ' ')}</em></article>)}
    </div>
  </WorkspaceLayout>
}
export function Reports() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/reports`, { credentials: 'include' })
      .then(response => response.json())
      .then(body => { if (body.success) setReports(body.data) })
      .finally(() => setLoading(false))
  }, [])

  return <WorkspaceLayout title="EVIDENCE REPORTS">
    <div className="inner-page"><span className="eyebrow">PATCH EVIDENCE</span><h1>Verified reports</h1>
      {loading && <div className="loading-state">Loading verified evidence…</div>}
      {!loading && reports.length === 0 && <div className="empty-investigation"><CheckCircle2/><b>No verified reports yet</b><p>Reports appear after Docker validation successfully passes.</p></div>}
      {reports.map(report => <article className="report-card" key={report._id}><CheckCircle2/><div><b>{report.summary || report.issueSnapshot?.title}</b><small>{report.issueSnapshot?.title || `Run ${report._id}`} · Docker {report.testResults?.status}</small></div><button>Open report <ArrowRight size={14}/></button></article>)}
    </div>
  </WorkspaceLayout>
}

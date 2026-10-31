import { useEffect, useState } from 'react'
import { ArrowRight, Activity, GitBranch } from 'lucide-react'
import WorkspaceLayout from '../layouts/WorkspaceLayout'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'

export default function Workspace() {
  const [url, setUrl] = useState('https://github.com/vercel/next.js')
  const [repository, setRepository] = useState<any>(null)
  const [issues, setIssues] = useState<any[]>([])
  const [githubRepositories, setGithubRepositories] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [run, setRun] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { fetch(`${API}/github/repos`, { credentials: 'include' }).then(r => r.json()).then(body => { if (body.success) setGithubRepositories(body.data) }).catch(() => undefined) }, [])
  async function request(path: string, options?: RequestInit) {
    const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error?.message || 'Request failed')
    return body.data
  }
  async function connect(repositoryUrl = url) {
    const normalizedUrl = String(repositoryUrl || '').trim()
    let validRepository = /^[^\s/]+\/[^\s/]+(?:\.git)?$/.test(normalizedUrl)
    if (!validRepository && /^https?:\/\//i.test(normalizedUrl)) {
      try {
        const parsed = new URL(normalizedUrl)
        validRepository = parsed.hostname === 'github.com' && parsed.pathname.split('/').filter(Boolean).length >= 2
      } catch (_) { validRepository = false }
    }
    if (!validRepository) {
      setMessage('Enter a repository as owner/repository or a GitHub URL.')
      return
    }
    setBusy(true); setMessage('Connecting repository...')
    try { const connected = await request('/repositories/connect', { method: 'POST', body: JSON.stringify({ repositoryUrl: normalizedUrl }) }); setRepository(connected); setIssues(await request(`/repositories/${connected._id}/issues?perPage=10`)); setMessage(`${connected.fullName} connected`) }
    catch (error: any) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function enableAgent(autoApprove = false) {
    if (!repository) return
    setBusy(true)
    try { await request(`/repositories/${repository._id}/monitor`, { method: 'POST', body: JSON.stringify({ autoApprove }) }); setMessage(autoApprove ? 'Verified automatic pull requests enabled' : 'Automatic issue monitoring enabled') }
    catch (error: any) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function runAction(action: string) {
    if (!run) return
    setBusy(true)
    try { const result = await request(`/agent/${run._id}/${action}`, { method: 'POST' }); setRun(result.runId ? { ...run, approvalState: 'approved', status: 'approved' } : result); setMessage(action === 'test' ? 'Docker validation complete' : action === 'approve' ? 'Patch approved' : 'Pull request prepared') }
    catch (error: any) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function analyze() {
    if (!repository || !selected) return
    setBusy(true)
    try { setRun(await request('/agent/analyze', { method: 'POST', body: JSON.stringify({ repositoryId: repository._id, issueNumber: selected.number }) })); setMessage('Investigation complete') }
    catch (error: any) { setMessage(error.message) } finally { setBusy(false) }
  }

  return <WorkspaceLayout title="WORKSPACE"><div className="workspace-page">
    <div className="dashboard-title"><div><span className="eyebrow">ISSUE-TO-PR</span><h1>Repository workspace</h1></div></div>
    <label className="repo-search"><GitBranch/><input value={url} onChange={event => setUrl(event.target.value)} placeholder="github.com/owner/repository"/><button className="button primary" onClick={() => connect()} disabled={busy}>{busy ? 'Working...' : 'Connect repository'} <ArrowRight size={15}/></button></label>
    {repository && <div className="monitor-actions"><button className="button ghost" disabled={busy} onClick={() => enableAgent(false)}>Enable issue agent</button><button className="button primary" disabled={busy} onClick={() => enableAgent(true)}>Enable verified auto PR</button></div>}
    {githubRepositories.length > 0 && <div className="github-projects"><div className="panel-title">YOUR GITHUB REPOSITORIES</div><div>{githubRepositories.map(item => <button key={item.id} onClick={() => { setUrl(`https://github.com/${item.fullName}`); connect(`https://github.com/${item.fullName}`) }}><b>{item.fullName}</b><span>{item.private ? 'private' : 'public'} · {item.language || 'Other'}</span></button>)}</div></div>}
    {message && <div className="workspace-message">{message}</div>}
    <div className="workspace-columns"><section><div className="panel-title">OPEN ISSUES <small>{issues.length} visible</small></div>{repository && <div className="connected-repository"><GitBranch size={15}/><b>{repository.fullName}</b></div>}{issues.length ? issues.map(issue => <button key={issue.number} onClick={() => setSelected(issue)} className={`issue-picker ${selected?.number === issue.number ? 'selected' : ''}`}><span>#{issue.number}</span><b>{issue.title}</b><small>{issue.labels?.[0] || 'issue'}</small></button>) : <div className="empty-investigation compact"><GitBranch/><b>{repository ? 'No open issues found' : 'Choose a repository'}</b><p>{repository ? 'Create or open a GitHub issue to begin an investigation.' : 'Select one of your GitHub repositories.'}</p></div>}</section>
      <section><div className="panel-title">AI INVESTIGATION</div>{run ? <div className="run-result"><span>{run.classification}</span>{run.confidence != null && <small className="run-confidence">AI confidence: {run.confidence}%</small>}<h2>{run.summary}</h2><p>{run.rootCause}</p>{run.status === 'not_actionable' ? <div className="workspace-message">No safe patch was generated.</div> : <><div>{run.relevantFiles?.map((file: string) => <code key={file}>{file}</code>)}</div><div className="agent-actions"><button className="button ghost" disabled={busy} onClick={() => runAction('test')}>Run Docker tests</button><button className="button ghost" disabled={busy || run.testResults?.status !== 'passed'} onClick={() => runAction('approve')}>Approve patch</button><button className="button primary" disabled={busy || run.approvalState !== 'approved'} onClick={() => runAction('pull-request')}>Open pull request</button></div></>}</div> : <div className="empty-investigation"><Activity/><b>{selected ? selected.title : 'Select an issue to begin'}</b><p>RepoPilot will inspect relevant source, create a patch, and verify it safely.</p>{selected && <button className="button primary" onClick={analyze}>Run AI investigation <ArrowRight size={15}/></button>}</div>}</section></div>
  </div></WorkspaceLayout>
}

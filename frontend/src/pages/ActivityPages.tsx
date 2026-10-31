import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, CheckCircle2 } from 'lucide-react'
import WorkspaceLayout from '../layouts/WorkspaceLayout'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'

export function Runs() {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch(`${API}/agent/runs`, { credentials: 'include' }).then(r => r.json()).then(body => { if (body.success) setRuns(body.data) }).finally(() => setLoading(false)) }, [])
  return <WorkspaceLayout title="AGENT RUNS"><div className="inner-page"><span className="eyebrow">EXECUTION STREAM</span><h1>Agent runs</h1>{loading && <div className="loading-state">Loading agent activity…</div>}{!loading && !runs.length && <div className="empty-investigation"><Activity/><b>No agent runs yet</b><p>Connect a repository, select an issue, and run an AI investigation.</p><Link className="button primary" to="/workspace">Open workspace</Link></div>}{runs.map(run => <article className="run-card" key={run._id}><span>{run._id}</span><div><b>{run.summary || run.issueSnapshot?.title}</b><small>Issue #{run.issueNumber}</small></div><em className={run.status === 'failed' ? 'failed' : ''}>{run.status?.replaceAll('_', ' ')}</em></article>)}</div></WorkspaceLayout>
}

export function Reports() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch(`${API}/reports`, { credentials: 'include' }).then(r => r.json()).then(body => { if (body.success) setReports(body.data) }).finally(() => setLoading(false)) }, [])
  return <WorkspaceLayout title="EVIDENCE REPORTS"><div className="inner-page"><span className="eyebrow">PATCH EVIDENCE</span><h1>Verified reports</h1>{loading && <div className="loading-state">Loading verified evidence…</div>}{!loading && !reports.length && <div className="empty-investigation"><CheckCircle2/><b>No verified reports yet</b><p>Reports appear after Docker validation successfully passes.</p></div>}{reports.map(report => <article className="report-card" key={report._id}><CheckCircle2/><div><b>{report.summary || report.issueSnapshot?.title}</b><small>{report.issueSnapshot?.title || `Run ${report._id}`} · Docker {report.testResults?.status}</small></div><button>Open report <ArrowRight size={14}/></button></article>)}</div></WorkspaceLayout>
}

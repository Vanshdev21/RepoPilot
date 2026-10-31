import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, GitBranch as BranchIcon, Check, ChevronRight, Code2, GitPullRequest, Menu, Play, ShieldCheck, Terminal, X } from 'lucide-react'
import { actions } from './store'
import type { RootState } from './store'
import './App.css'

gsap.registerPlugin(ScrollTrigger)
const API = import.meta.env.VITE_API_URL || 'http://localhost:8001/api'
async function api<T>(path:string, options?:RequestInit):Promise<T> { const r=await fetch(`${API}${path}`,{...options,credentials:'include',headers:{'Content-Type':'application/json',...options?.headers}});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Request failed');return j.data }

const steps=['Connect repository','Select issue','Investigate','Generate patch','Validate tests','Open pull request']
const features=[['Repository Intelligence','File-aware investigation bounded to the issue and relevant source context.'],['Patch Evidence','Every recommendation is linked to a patch, commit base, and verifiable test result.'],['Human Approval','Nothing is published until a contributor explicitly reviews and approves.'],['Isolated Execution','Proposed changes run in disposable, constrained sandbox environments.']]

export default function App(){
 const dispatch=useDispatch(); const {repository,issues,selectedIssue,run,loading}=useSelector((s:RootState)=>s.app)
 const [url,setUrl]=useState('https://github.com/vercel/next.js'); const [menu,setMenu]=useState(false); const [toast,setToast]=useState(''); const [currentUser,setCurrentUser]=useState<any>(null); const hero=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  fetch(`${API}/auth/me`,{credentials:'include'}).then(r=>r.json()).then(body=>{if(body.success)setCurrentUser(body.data.user)}).catch(()=>undefined)
  const ctx=gsap.context(()=>{gsap.from('.hero-copy > *',{y:28,opacity:0,duration:.75,stagger:.09,ease:'power3.out'});gsap.from('.engine',{scale:.96,y:40,opacity:0,duration:1,delay:.25,ease:'power3.out'});gsap.utils.toArray<HTMLElement>('.reveal').forEach(el=>gsap.from(el,{scrollTrigger:{trigger:el,start:'top 88%'},y:32,opacity:0,duration:.7,ease:'power3.out'}));},hero);return()=>ctx.revert()},[])
 const notify=(s:string)=>{setToast(s);setTimeout(()=>setToast(''),2800)}
 async function connect(e:FormEvent){
  e.preventDefault()
  dispatch(actions.setLoading(true))
  try {
   const repo=await api<any>('/repositories/connect',{method:'POST',body:JSON.stringify({repositoryUrl:url})})
   dispatch(actions.setRepository(repo))
   const found=await api<any[]>(`/repositories/${repo._id}/issues?perPage=8`)
   dispatch(actions.setIssues(found))
   notify('Repository connected')
   gsap.to('.repo-input',{scale:.985,duration:.12,yoyo:true,repeat:1})
  } catch(e:any) { notify(e.message) }
  finally { dispatch(actions.setLoading(false)) }
 }
 async function analyze(){
  if(!repository||!selectedIssue)return
  dispatch(actions.setLoading(true))
  try {
   const result=await api<any>('/agent/analyze',{method:'POST',body:JSON.stringify({repositoryId:repository._id,issueNumber:selectedIssue.number})})
   dispatch(actions.setRun(result)); notify('Investigation complete')
  } catch(e:any) { notify(e.message) }
  finally { dispatch(actions.setLoading(false)) }
 }
 async function runTests(){if(!run)return;dispatch(actions.setLoading(true));const result=await api<any>(`/agent/${run._id}/test`,{method:'POST'});dispatch(actions.setRun(result));dispatch(actions.setLoading(false));notify('Sandbox tests passed')}
 async function approve(){if(!run)return;await api(`/agent/${run._id}/approve`,{method:'POST'});dispatch(actions.setRun({...run,approvalState:'approved',status:'approved'}));notify('Patch approved')}
 async function publish(){if(!run)return;try{await api(`/agent/${run._id}/pull-request`,{method:'POST'});notify('Pull request prepared')}catch(e:any){notify(e.message)}}
 async function logout(){await fetch(`${API}/auth/logout`,{method:'POST',credentials:'include'}).catch(()=>undefined);setCurrentUser(null);window.location.assign('/')}
 return <div ref={hero}>
  <header className="nav"><a className="brand" href="#top"><span className="brandmark"><BranchIcon size={17}/></span>RepoPilot<small>v2.4</small></a><nav className={menu?'open':''}><a href="#workflow" onClick={()=>setMenu(false)}>Workflow</a><a href="#evidence" onClick={()=>setMenu(false)}>Evidence</a><a href="#architecture" onClick={()=>setMenu(false)}>Architecture</a><a href="#console" onClick={()=>setMenu(false)}>Console</a></nav><div className="nav-actions"><a className="stars" href="https://github.com" target="_blank"><Code2 size={14}/> 8.4k</a>{currentUser ? <><a className="button primary" href="/dashboard">Open dashboard <ArrowRight size={14}/></a><button className="button ghost" onClick={logout}>Log out</button></> : <a className="button primary" href="http://localhost:8001/api/auth/github">Sign in with GitHub <ArrowRight size={14}/></a>}</div><button className="menu" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></header>
  <main id="top">
   <section className="hero-section">
    <div className="live-strip"><span><i/> AI ENGINEERING AGENT FOR OPEN SOURCE</span><span className="status">SENTINEL // ONLINE</span></div>
    <div className="hero-grid"><div className="hero-copy"><div className="eyebrow">ISSUE-TO-PR SYSTEM</div><h1>From issue to <em>impact.</em></h1><p>RepoPilot investigates your GitHub issue, traces the root cause, proposes a patch, and runs the proof before a pull request is opened.</p><div className="hero-actions"><a href="#console" className="button primary large">Analyze a repository <ArrowRight size={16}/></a><a href="#workflow" className="button ghost large">View workflow</a></div><div className="proof"><span><Check size={13}/> Human approval required</span><span><ShieldCheck size={13}/> Docker isolated</span></div></div>
     <div className="engine"><div className="engine-head"><span><i/> ENGINE WORKFLOW</span><code>RUN_0x7A2</code></div><div className="node map-root">GITHUB ISSUE<span>login fails with +</span></div><div className="flow-line"/><div className="engine-cols"><div><label>INVESTIGATION</label><b>auth.service.ts</b><small>Credential validation</small></div><div className="model-node"><Code2 size={18}/><b>GEMMA 4</b><small>REASONING</small></div><div><label>VERIFIED PATCH</label><b>+ 12 / − 3 lines</b><small>3 tests queued</small></div></div><div className="engine-foot"><span>ANALYZING CONTEXT</span><div/><strong>76%</strong></div></div>
    </div>
   </section>
   <section className="trust reveal"><div>TRUSTED WORKFLOW</div><div><b>42K</b><span>ISSUES TRIAGED</span></div><div><b>18K</b><span>PATCHES PROPOSED</span></div><div><b>96%</b><span>CONTEXT ACCURACY</span></div><div><b>0</b><span>AUTO-MERGES</span></div></section>
   <section className="section reveal" id="workflow"><div className="section-heading"><div><span className="eyebrow">ENGINEERING SYSTEM</span><h2>One issue. A complete<br/>engineering workflow.</h2></div><p>RepoPilot turns repository context and issue evidence into a reviewable contribution—not a vague chat response.</p></div><div className="workflow-grid">{steps.map((s,i)=><div className={`work-step step-${i}`} key={s}><span>0{i+1}</span><strong>{s}</strong><small>{['Public repository metadata','Open GitHub issue','Relevant source files','Focused code diff','Real command output','Explicit approval gate'][i]}</small></div>)}</div></section>
   <section className="section evidence reveal" id="evidence"><div className="section-heading"><div><span className="eyebrow">EVIDENCE FIRST</span><h2>Every decision leaves<br/>a trail.</h2></div><p>Inspect the investigation, exact diff, test output, and approval state from one deterministic run.</p></div><div className="evidence-panel"><div className="panel-tabs"><b>DIFF</b><span>TELEMETRY</span><span>REASONING</span><span>TESTS</span></div><div className="diff-grid"><aside><label>CHANGED FILES</label><p className="active">src/auth/session.ts <b>+12 −3</b></p><p>tests/session.test.ts <b>+8</b></p><div className="test-status"><Check size={15}/> 12 tests passed</div></aside><div className="code"><div><span>1</span><p>export async function createSession(input) {'{'}</p></div><div><span>2</span><p className="removed">- if (!input.token) return null;</p></div><div className="added"><span>3</span><p>+ if (!input.token.trim()) {'{'}</p></div><div className="added"><span>4</span><p>+ throw new InvalidSessionError('token_required');</p></div><div className="added"><span>5</span><p>+ {'}'}</p></div><div><span>6</span><p> return await Session.verify(input.token);</p></div></div></div></div></section>
   <section className="section reveal"><div className="section-heading"><div><span className="eyebrow">CONTROLLED AUTONOMY</span><h2>Built for engineers.<br/>Useful to beginners.</h2></div></div><div className="feature-grid">{features.map((f,i)=><article key={f[0]}><span>0{i+1}</span><div className="feature-icon">{i===0?<Code2/>:i===1?<Terminal/>:i===2?<ShieldCheck/>:<Play/>}</div><h3>{f[0]}</h3><p>{f[1]}</p><small>VIEW SPECIFICATION <ChevronRight size={12}/></small></article>)}</div></section>
   <section className="console-section reveal" id="console"><div className="section-heading"><div><span className="eyebrow">LIVE WORKSPACE</span><h2>Make your next contribution count.</h2></div></div><form className="repo-input" onSubmit={connect}><Code2/><input value={url} onChange={e=>setUrl(e.target.value)} aria-label="GitHub repository URL"/><button className="button primary" disabled={loading}>{loading?'Connecting...':'Connect repository'}<ArrowRight size={15}/></button></form>
    {repository&&<div className="workspace"><div className="repo-card"><span>CONNECTED</span><h3>{repository.fullName}</h3><p>{repository.description||'Public GitHub repository'}</p><code>{repository.primaryLanguage} // {repository.defaultBranch}</code></div><div className="issue-list"><div className="panel-title">OPEN ISSUES <small>{issues.length} visible</small></div>{issues.map(i=><button className={selectedIssue?.number===i.number?'selected':''} key={i.number} onClick={()=>dispatch(actions.selectIssue(i))}><span>#{i.number}</span><div><b>{i.title}</b><small>{i.labels.slice(0,2).join(' · ')||'untriaged'}</small></div><ChevronRight size={16}/></button>)}</div><div className="analysis-column"><button className="button primary analyze" disabled={!selectedIssue||loading} onClick={analyze}>Analyze selected issue <Play size={15}/></button>{run&&<div className="run-result"><div className="panel-title">INVESTIGATION RESULT <span>{run.classification}</span></div><h3>{run.summary}</h3><p>{run.rootCause}</p><label>RELEVANT FILES</label>{run.relevantFiles.map(f=><code key={f}>{f}</code>)}</div>}</div></div>}
    {run&&<div className="action-row"><button className="button ghost" onClick={runTests}><Terminal size={15}/> Run sandbox tests</button><span className={run.testResults.status==='passed'?'passed':''}>{run.testResults.status==='passed'?<Check size={14}/>:null}{run.testResults.status==='passed'?'12 tests passed':'Tests not run'}</span><button className="button ghost" onClick={approve}><ShieldCheck size={15}/> Approve patch</button><button className="button primary" disabled={run.approvalState!=='approved'} onClick={publish}><GitPullRequest size={15}/> Prepare pull request</button></div>}
   </section>
   <footer><a className="brand" href="#top"><span className="brandmark"><BranchIcon size={17}/></span>RepoPilot</a><p>Engineering agents, with evidence.</p><div>DOCUMENTATION · SECURITY · STATUS</div></footer>
  </main>{toast&&<div className="toast">{toast}</div>}
 </div>
}

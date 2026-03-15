import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as faceapi from '@vladmandic/face-api';
import { FaceService } from './lib/face-service';

interface UserData {
  name: string; count: number; registered_at: string;
  encoding_json?: string; thumb?: string;
}
interface AttendanceLog { id: number; name: string; timestamp: string; }
interface LiveFace { name: string; known: boolean; }
interface GWPayload {
  person_count: number; unknown_count: number; processing_ms: number;
  max_severity: string; location: string;
  detections: { label: string; confidence: number }[];
  anomalies?: any[];
  turbidity?: { level: string; score: number; color_signature: string };
}
type Tab = 'scan' | 'enroll' | 'vault' | 'log' | 'greenwatch';

const API_URL = 'http://localhost:3001';
const GW_WS   = 'ws://localhost:8000/ws';
const GW_HTTP = 'http://localhost:8000';
const GW_FILE = 'file:///F:/FaceNet/dashboard.html';

const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
const fmtDate = (ts: string) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const TURB_COL: Record<string, string> = {
  CLEAR: '#00f593', MODERATE: '#fbbf24', TURBID: '#f97316', CRITICAL: '#ff4757',
};

const I = {
  scan:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2"/><circle cx="12" cy="12" r="3"/><path d="M12 9V7M12 17v-2M15 12h2M7 12h2"/></svg>),
  enroll:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7"/><path d="M18 14h4M20 12v4"/></svg>),
  vault:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a4 4 0 018 0v2"/><circle cx="12" cy="14" r="2"/></svg>),
  log:     (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>),
  gw:      (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>),
  refresh: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>),
  search:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>),
  shield:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/><path d="M9 12l2 2 4-4"/></svg>),
  warn:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>),
  expand:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>),
  water:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2C6 9 4 13 4 16a8 8 0 0016 0c0-3-2-7-8-14z"/></svg>),
  chevL:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>),
  chevR:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>),
  ok:      (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>),
};

function BootScreen() {
  return (
    <div className="boot">
      <div className="boot-ring"><div className="boot-ring-inner" /><div className="boot-icon">{I.shield}</div></div>
      <p className="boot-name">FACENET NODE</p>
      <p className="boot-sub">Initialising biometric engines</p>
      <div className="boot-dots"><span /><span /><span /></div>
    </div>
  );
}

function GWWidget({ payload, up }: { payload: GWPayload | null; up: boolean }) {
  const lvl   = payload?.turbidity?.level ?? '--';
  const score = payload?.turbidity?.score ?? 0;
  const col   = TURB_COL[lvl] ?? '#3d5273';
  const sev   = payload?.max_severity ?? 'none';
  return (
    <div className="gw-widget">
      <div className="gw-widget-hdr">
        <span className="gw-widget-title">GreenWatch Feed</span>
        <span className={`gw-ws-dot${up ? ' live' : ''}`} />
      </div>
      {payload ? (
        <>
          <div className="gw-widget-row"><span className="gw-wlbl">Persons</span>
            <span className="gw-wval" style={{ color: (payload.person_count??0)>3?'#ff4757':'#00d4ff' }}>{payload.person_count??0}</span></div>
          <div className="gw-widget-row"><span className="gw-wlbl">Severity</span>
            <span className="gw-wval" style={{ color: sev==='high'?'#ff4757':sev==='medium'?'#f97316':sev==='low'?'#fbbf24':'#3d5273' }}>{sev.toUpperCase()}</span></div>
          <div className="gw-widget-row"><span className="gw-wlbl">Water</span>
            <span className="gw-wval" style={{ color: col }}>{lvl}</span></div>
          {score > 0 && (
            <div className="gw-score-bar-wrap">
              <div className="gw-score-bar-bg"><div className="gw-score-bar-fill" style={{ width:`${score}%`, background:col }} /></div>
              <span className="gw-score-num">{score}/100</span>
            </div>
          )}
          <div className="gw-widget-row"><span className="gw-wlbl">Infer</span>
            <span className="gw-wval c-muted">{Math.round(payload.processing_ms??0)}ms</span></div>
        </>
      ) : (
        <p className="gw-widget-off">{up ? 'Awaiting data...' : 'Server offline'}</p>
      )}
    </div>
  );
}

export default function App() {
  const [ready, setReady]           = useState(false);
  const [tab, setTab]               = useState<Tab>('scan');
  const [collapsed, setCollapsed]   = useState(false);
  const [users, setUsers]           = useState<UserData[]>([]);
  const [logs, setLogs]             = useState<AttendanceLog[]>([]);
  const [serverUp, setServerUp]     = useState<boolean | null>(null);
  const [gwUp, setGwUp]             = useState(false);
  const [gwPayload, setGwPayload]   = useState<GWPayload | null>(null);
  const [scanning, setScanning]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [enrolling, setEnrolling]   = useState(false);
  const [search, setSearch]         = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [lastSeen, setLastSeen]     = useState<string | null>(null);
  const [faces, setFaces]           = useState<LiveFace[]>([]);
  const [camReady, setCamReady]     = useState(false);
  const [clock, setClock]           = useState('');
  const [toast, setToast]           = useState<{msg:string;ok?:boolean}|null>(null);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout>|null>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef     = useRef<WebSocket | null>(null);
  const wsRetry   = useRef(2000);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB',{hour12:false}));
    tick(); const id = setInterval(tick,1000); return () => clearInterval(id);
  },[]);

  useEffect(() => {
    (async () => {
      try { await FaceService.loadModels(); await fetchUsers(); await fetchLogs(); }
      catch(e){ console.error(e); } finally { setReady(true); }
    })();
  },[]);

  const connectGW = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(GW_WS);
    wsRef.current = ws;
    ws.onopen  = () => { setGwUp(true); wsRetry.current=2000; };
    ws.onclose = () => {
      setGwUp(false);
      setTimeout(connectGW, wsRetry.current);
      wsRetry.current = Math.min(wsRetry.current*1.5, 15000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try { const m=JSON.parse(e.data); if(m.type==='inference_result') setGwPayload(m.payload); } catch {}
    };
  },[]);

  useEffect(() => { connectGW(); return () => { wsRef.current?.close(); }; },[connectGW]);

  useEffect(() => {
    if (!ready) return;
    if (tab==='scan'||tab==='enroll') startCam(); else stopCam();
  },[tab,ready]);

  const startCam = async () => {
    try {
      if (streamRef.current) return;
      const s = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}}});
      streamRef.current = s;
      if (videoRef.current){ videoRef.current.srcObject=s; videoRef.current.onloadedmetadata=()=>setCamReady(true); }
    } catch { showToast('Camera access denied',false); }
  };

  const stopCam = () => {
    setCamReady(false);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current = null;
    if(videoRef.current) videoRef.current.srcObject=null;
  };

  const fetchUsers = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/users`,{signal:AbortSignal.timeout(3000)});
      if(!r.ok) throw new Error();
      const d = await r.json();
      setUsers(Array.isArray(d)?d:[]);
      setServerUp(true);
    } catch { setServerUp(false); }
  },[]);

  const fetchLogs = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if(search) p.append('search',search);
      if(dateFilter) p.append('date',dateFilter);
      const r = await fetch(`${API_URL}/api/attendance?${p}`);
      if(!r.ok) throw new Error();
      const d = await r.json();
      setLogs(Array.isArray(d)?d:[]);
    } catch {}
  },[search,dateFilter]);

  useEffect(()=>{ if(ready){ fetchUsers(); fetchLogs(); } },[ready]);
  useEffect(()=>{ if(ready) fetchLogs(); },[search,dateFilter]);

  useEffect(()=>{
    let animId: number; let throttle=0;
    const detect = async () => {
      if(videoRef.current&&canvasRef.current&&camReady&&tab==='scan'&&Date.now()-throttle>200){
        throttle=Date.now();
        const vid=videoRef.current, canvas=canvasRef.current;
        const ctx=canvas.getContext('2d');
        if(!ctx){ animId=requestAnimationFrame(detect); return; }
        const dims=faceapi.matchDimensions(canvas,vid,true);
        const dets=await FaceService.detectFaces(vid);
        const resized=faceapi.resizeResults(dets,dims);
        const withDesc=users.filter(u=>u.encoding_json).map(u=>({name:u.name,descriptor:JSON.parse(u.encoding_json!)}));
        const matcher=FaceService.createMatcher(withDesc);
        ctx.clearRect(0,0,canvas.width,canvas.height);
        setScanning(resized.length>0);
        const live: LiveFace[]=[];
        resized.forEach(det=>{
          const best=matcher?.findBestMatch(det.descriptor);
          const rawName=(best?.toString()||'Unknown').split(' ')[0];
          const known=rawName!=='unknown';
          live.push({name:known?rawName:'Unknown',known});
          const {x,y,width,height}=det.detection.box;
          const col=known?'#00d4ff':'#ff4757'; const L=16;
          ctx.strokeStyle=col+'44'; ctx.lineWidth=1; ctx.setLineDash([5,4]);
          ctx.strokeRect(x,y,width,height); ctx.setLineDash([]);
          ctx.strokeStyle=col; ctx.lineWidth=2.5;
          [[x,y,L,0,0,L],[x+width,y,-L,0,0,L],[x,y+height,L,0,0,-L],[x+width,y+height,-L,0,0,-L]].forEach(([px,py,dx1,dy1,dx2,dy2])=>{
            ctx.beginPath(); ctx.moveTo(px+dx1,py+dy1); ctx.lineTo(px,py); ctx.lineTo(px+dx2,py+dy2); ctx.stroke();
          });
          const label=known?rawName.toUpperCase():'UNIDENTIFIED';
          ctx.font='700 9px "JetBrains Mono",monospace';
          const tw=ctx.measureText(label).width;
          ctx.fillStyle=col; ctx.fillRect(x,y-22,tw+14,18);
          ctx.fillStyle='#050810'; ctx.fillText(label,x+7,y-8);
          if(known&&rawName!==lastSeen){
            setLastSeen(rawName);
            fetch(`${API_URL}/api/attendance`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:rawName})})
              .then(()=>{ fetchLogs(); fetchUsers(); });
            setTimeout(()=>setLastSeen(null),5000);
          }
        });
        setFaces(live);
      }
      animId=requestAnimationFrame(detect);
    };
    if(tab==='scan'&&ready) detect();
    return ()=>cancelAnimationFrame(animId);
  },[camReady,tab,users,lastSeen,ready]);

  const handleEnroll = async () => {
    if(!videoRef.current||!newName.trim()) return;
    setEnrolling(true);
    try {
      const dets=await FaceService.detectFaces(videoRef.current);
      if(!dets.length){ showToast('No face detected -- adjust lighting',false); return; }
      const descriptor=Array.from(dets[0].descriptor);
      const tmp=document.createElement('canvas'); tmp.width=tmp.height=160;
      tmp.getContext('2d')?.drawImage(videoRef.current,0,0,160,160);
      const thumb=tmp.toDataURL('image/jpeg',0.85);
      const res=await fetch(`${API_URL}/api/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName.trim(),encoding:JSON.stringify(descriptor),thumb})});
      const data=await res.json();
      if(data.ok){ setNewName(''); await fetchUsers(); setTab('vault'); showToast(`${newName.trim()} enrolled`,true); }
      else showToast(data.msg||'Enrollment failed',false);
    } catch(e){ console.error(e); } finally { setEnrolling(false); }
  };

  const showToast=(msg:string,ok=true)=>{
    setToast({msg,ok});
    if(toastTimer) clearTimeout(toastTimer);
    setToastTimer(setTimeout(()=>setToast(null),4000));
  };

  if(!ready) return <BootScreen />;

  const todayCount=logs.filter(l=>new Date(l.timestamp).toDateString()===new Date().toDateString()).length;
  const unknownCount=faces.filter(f=>!f.known).length;

  const navItems=[
    {id:'scan'   as Tab, icon:I.scan,   label:'Biometric Scan',  sub: scanning?'Scanning...':'Live detection'},
    {id:'enroll' as Tab, icon:I.enroll, label:'Enroll Identity', sub:'Register profile'},
    {id:'vault'  as Tab, icon:I.vault,  label:'Identity Vault',  sub:`${users.length} profiles`},
    {id:'log'    as Tab, icon:I.log,    label:'Access Log',      sub:`${todayCount} today`},
  ];

  return (
    <div className="app">
      <AnimatePresence>
        {toast&&(
          <motion.div className={`toast${toast.ok?' toast-ok':' toast-err'}`}
            initial={{opacity:0,y:12,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:6,scale:.97}}>
            <span className="toast-icon">{toast.ok?I.ok:I.warn}</span>{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`sidebar${collapsed?' sidebar-collapsed':''}`}>
        <div className="sb-logo">
          {!collapsed&&(
            <div className="sb-logo-block">
              <div className="sb-logo-badge">{I.shield}</div>
              <div className="sb-logo-text"><span className="sb-logo-name">FACENET</span><span className="sb-logo-node">NODE V2</span></div>
            </div>
          )}
          {collapsed&&<div className="sb-logo-badge sb-logo-badge-sm">{I.shield}</div>}
          <button className="sb-collapse" onClick={()=>setCollapsed(c=>!c)}>{collapsed?I.chevR:I.chevL}</button>
        </div>

        <nav className="sb-nav">
          {navItems.map(item=>(
            <button key={item.id} className={`sb-item${tab===item.id?' sb-active':''}`}
              onClick={()=>setTab(item.id)} title={collapsed?item.label:undefined}>
              <span className="sb-item-icon">{item.icon}</span>
              {!collapsed&&(
                <span className="sb-item-text">
                  <span className="sb-item-label">{item.label}</span>
                  <span className="sb-item-sub">{item.sub}</span>
                </span>
              )}
              {!collapsed&&item.id==='vault'&&users.length>0&&<span className="sb-count">{users.length}</span>}
              {!collapsed&&item.id==='scan'&&scanning&&<span className="sb-live-badge">LIVE</span>}
            </button>
          ))}
          <div className="sb-sep" />
          <button className={`sb-item sb-gw-item${tab==='greenwatch'?' sb-active sb-gw-active':''}`}
            onClick={()=>setTab('greenwatch')} title={collapsed?'GreenWatch':undefined}>
            <span className="sb-item-icon">{I.gw}</span>
            {!collapsed&&(
              <span className="sb-item-text">
                <span className="sb-item-label">GreenWatch</span>
                <span className="sb-item-sub">YOLO   Environmental</span>
              </span>
            )}
            <span className={`sb-gw-dot${gwUp?' gw-live':''}`} />
          </button>
        </nav>

        {!collapsed&&<div className="sb-gw-widget-wrap"><GWWidget payload={gwPayload} up={gwUp} /></div>}

        <div className="sb-foot">
          <span className={`sb-foot-dot${serverUp===true?' dot-up':serverUp===false?' dot-down':' dot-wait'}`} />
          {!collapsed&&<span className="sb-foot-txt">{serverUp===null?'Connecting...':serverUp?'API :3001 online':'API :3001 offline'}</span>}
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-breadcrumb">
              <span className="topbar-system">SENTINEL</span>
              <span className="topbar-sep">/</span>
              <span className="topbar-page">
                {tab==='scan'?'Biometric Scanner':tab==='enroll'?'Enroll Identity':tab==='vault'?'Identity Vault':tab==='log'?'Access Log':'GreenWatch'}
              </span>
            </div>
            <p className="topbar-sub">
              {tab==='scan'?`${users.length} profiles loaded   ${faces.length} face${faces.length!==1?'s':''} in frame`
               :tab==='enroll'?'Register a new biometric identity'
               :tab==='vault'?`${users.length} identit${users.length!==1?'ies':'y'} enrolled`
               :tab==='log'?`${logs.length} records   ${todayCount} today`
               :'Live YOLO surveillance   Galamsey detection'}
            </p>
          </div>
          <div className="topbar-right">
            <div className={`gw-status-pill${gwUp?' gw-pill-live':' gw-pill-off'}`}>
              <span className="gw-pill-dot" /><span>GW {gwUp?'LIVE':'OFFLINE'}</span>
            </div>
            {gwPayload?.turbidity&&(
              <div className="turb-pill" style={{borderColor:TURB_COL[gwPayload.turbidity.level]+'55'}}>
                <span className="turb-pill-icon">{I.water}</span>
                <span style={{color:TURB_COL[gwPayload.turbidity.level]}}>{gwPayload.turbidity.level}</span>
              </div>
            )}
            <div className="topbar-clock">{clock}</div>
          </div>
        </header>

        {/* KPI strip */}
        {tab!=='greenwatch'&&(
          <div className="kpi-strip">
            {[
              {lbl:'Enrolled',  val:String(users.length),         sub:'profiles',  hi:false},
              {lbl:'Today',     val:String(todayCount),           sub:'verified',  hi:false},
              {lbl:'In Frame',  val:String(faces.length),         sub:'faces',     hi:scanning},
              {lbl:'Unknown',   val:String(unknownCount),         sub:'unmatched', hi:unknownCount>0},
              {lbl:'Log Total', val:String(logs.length),          sub:'records',   hi:false},
              {lbl:'GW Persons',val:String(gwPayload?.person_count??'--'),sub:'live',hi:false},
            ].map(k=>(
              <div key={k.lbl} className={`kpi${k.hi?' kpi-hi':''}`}>
                <span className="kpi-lbl">{k.lbl}</span>
                <span className="kpi-val">{k.val}</span>
                <span className="kpi-sub">{k.sub}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pages">
          <AnimatePresence mode="wait">

            {/* SCAN */}
            {tab==='scan'&&(
              <motion.div key="scan" className="page pg-scan"
                initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
                <div className="scan-feed-wrap">
                  <video ref={videoRef} autoPlay muted playsInline className="scan-vid" />
                  <canvas ref={canvasRef} className="scan-cvs" />
                  {scanning&&<div className="scan-sweep" />}
                  <div className="hc tl"/><div className="hc tr"/><div className="hc bl"/><div className="hc br"/>
                  <div className="feed-hud-top">
                    <span className={`rec-badge${scanning?' rec-active':''}`}><span className="rec-dot"/>{scanning?'SCANNING':'STANDBY'}</span>
                    <span className="feed-enc">AES-256-GCM</span>
                  </div>
                  <div className="feed-hud-bot">
                    <span className="feed-res">1280 x 720</span>
                    <span className="feed-clock">{clock}</span>
                  </div>
                  {!camReady&&<div className="feed-init-overlay"><div className="feed-init-spinner"/><span>Initialising camera...</span></div>}
                </div>

                <div className="scan-panel">
                  <div className="sp-stats-row">
                    {[
                      {l:'Detected', v:faces.length, c:''},
                      {l:'Matched',  v:faces.filter(f=>f.known).length, c:'c-cyan'},
                      {l:'Unknown',  v:unknownCount, c:unknownCount>0?'c-red':''},
                      {l:'Vault',    v:users.length, c:''},
                    ].map(s=>(
                      <div key={s.l} className="sp-stat">
                        <span className="sp-stat-lbl">{s.l}</span>
                        <span className={`sp-stat-val ${s.c}`}>{s.v||'--'}</span>
                      </div>
                    ))}
                  </div>
                  <div className={`sp-status-bar${scanning?' sp-status-active':''}`}>
                    <span className="sp-status-dot"/><span>{scanning?`${faces.length} face${faces.length!==1?'s':''} detected`:'Ready -- position face in frame'}</span>
                  </div>
                  <div className="sp-faces-hdr">
                    <span className="sp-faces-title">Live Detections</span>
                    <span className="sp-faces-badge">{faces.length}</span>
                  </div>
                  <div className="sp-faces-list">
                    {faces.length===0?(
                      <div className="empty-sm"><span className="empty-sm-icon">{I.scan}</span><span>No faces in frame</span></div>
                    ):faces.map((f,i)=>(
                      <div key={i} className={`face-row${f.known?'':' face-unknown'}`}>
                        <div className={`face-av${f.known?' face-av-known':' face-av-unk'}`}>{f.known?initials(f.name):'?'}</div>
                        <div className="face-info">
                          <span className="face-name">{f.name}</span>
                          <span className={`face-tag${f.known?' tag-match':' tag-unk'}`}>{f.known?'MATCHED':'UNIDENTIFIED'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="sp-actions">
                    <button className="btn-outline" onClick={fetchUsers}>{I.refresh} Refresh</button>
                    <button className="btn-primary" onClick={()=>setTab('enroll')}>+ Enroll</button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ENROLL */}
            {tab==='enroll'&&(
              <motion.div key="enroll" className="page pg-enroll"
                initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
                <div className="enroll-form-col">
                  <div className="enroll-heading">
                    <div className="enroll-heading-icon">{I.enroll}</div>
                    <div><h2 className="enroll-h2">New Identity</h2><p className="enroll-p">Register a biometric profile.</p></div>
                  </div>
                  <div className="field-group">
                    <label className="field-lbl">Name / Identifier</label>
                    <input className="field-inp" type="text" value={newName}
                      onChange={e=>setNewName(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&handleEnroll()}
                      placeholder="e.g. John Mensah" autoFocus />
                  </div>
                  <div className="enroll-steps">
                    <p className="enroll-steps-title">Instructions</p>
                    {['Enter a name above','Face the camera squarely','Ensure good, even lighting','Press Enroll Identity'].map((s,i)=>(
                      <div key={i} className="step-row"><span className="step-n">{i+1}</span><span className="step-t">{s}</span></div>
                    ))}
                  </div>
                  <div className="enroll-actions">
                    <button className={`btn-primary enroll-btn${enrolling||!newName.trim()?' btn-disabled':''}`}
                      onClick={handleEnroll} disabled={enrolling||!newName.trim()}>
                      {enrolling?<><span className="spinner"/> Capturing...</>:'Enroll Identity'}
                    </button>
                    <button className="btn-outline" onClick={()=>setTab('vault')}>View Vault ({users.length})</button>
                  </div>
                  {serverUp===false&&<div className="offline-warn">{I.warn}<span>API offline   run <code>npm run server</code></span></div>}
                </div>
                <div className="enroll-cam-col">
                  <div className="enroll-cam-wrap">
                    <video ref={tab==='enroll'?videoRef:undefined} autoPlay muted playsInline className="enroll-vid" />
                    <div className="enroll-reticle">
                      <span className="rt tl"/><span className="rt tr"/><span className="rt bl"/><span className="rt br"/>
                      <div className="reticle-oval"/>
                    </div>
                    <div className="enroll-cam-label">Align face within oval</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* VAULT */}
            {tab==='vault'&&(
              <motion.div key="vault" className="page pg-vault"
                initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
                <div className="vault-toolbar">
                  <span className="vault-count">{users.length} identit{users.length!==1?'ies':'y'}</span>
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn-outline sm" onClick={fetchUsers}>{I.refresh}</button>
                    <button className="btn-primary sm" onClick={()=>setTab('enroll')}>+ Enroll</button>
                  </div>
                </div>
                {users.length===0?(
                  <div className="vault-empty">
                    <div className="vault-empty-icon">{I.vault}</div>
                    {serverUp===false?(
                      <><p className="vault-empty-h">Server offline</p><p className="vault-empty-s">Run: <code>npm run server</code></p><button className="btn-outline" onClick={fetchUsers}>Retry</button></>
                    ):(
                      <><p className="vault-empty-h">Vault is empty</p><p className="vault-empty-s">No identities registered yet</p><button className="btn-primary" onClick={()=>setTab('enroll')}>+ Enroll First Identity</button></>
                    )}
                  </div>
                ):(
                  <div className="vault-grid">
                    {users.map(u=>(
                      <motion.div key={u.name} layout className="vault-card">
                        <div className="vc-photo">
                          {u.thumb?<img src={u.thumb} alt={u.name}/>:<span className="vc-initials">{initials(u.name)}</span>}
                          <div className="vc-photo-glow"/>
                        </div>
                        <div className="vc-body">
                          <span className="vc-name">{u.name}</span>
                          <div className="vc-chips">
                            <span className="vc-chip">{u.count??0}x verified</span>
                            <span className="vc-id">{u.name.slice(0,3).toUpperCase()}-{String(u.count??0).padStart(3,'0')}</span>
                          </div>
                        </div>
                        <div className="vc-status-bar"/>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* LOG */}
            {tab==='log'&&(
              <motion.div key="log" className="page pg-log"
                initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
                <div className="log-toolbar">
                  <div className="log-search-box">
                    <span className="log-search-icon">{I.search}</span>
                    <input className="log-search" type="text" placeholder="Search identity..." value={search} onChange={e=>setSearch(e.target.value)}/>
                  </div>
                  <input className="log-date" type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/>
                  {dateFilter&&<button className="btn-outline sm" onClick={()=>setDateFilter('')}>x</button>}
                  <span className="log-total">{logs.length} records</span>
                  <button className="btn-outline sm" onClick={fetchLogs} style={{marginLeft:'auto'}}>{I.refresh}</button>
                </div>
                <div className="log-scroll">
                  {logs.length===0?(
                    <div className="empty-full"><div className="empty-full-icon">{I.log}</div><p>No records found</p></div>
                  ):(
                    <table className="log-table">
                      <thead><tr><th>Identity</th><th>Time</th><th>Date</th><th>Gate</th><th>Status</th></tr></thead>
                      <tbody>
                        {logs.map(l=>(
                          <tr key={l.id}>
                            <td><div className="log-identity"><div className="log-av">{initials(l.name)}</div><span>{l.name}</span></div></td>
                            <td><span className="log-time-val">{fmtTime(l.timestamp)}</span></td>
                            <td><span className="log-date-val">{fmtDate(l.timestamp)}</span></td>
                            <td><span className="log-gate">BIOMETRIC_01</span></td>
                            <td><span className="log-badge">VERIFIED</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}

            {/* GREENWATCH */}
            {tab==='greenwatch'&&(
              <motion.div key="greenwatch" className="page pg-gw"
                initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                <div className="gw-topstrip">
                  <div className="gw-topstrip-left">
                    <span className={`gw-live-pill${gwUp?' pill-live':' pill-off'}`}><span className="pill-dot"/>{gwUp?'LIVE':'OFFLINE'}</span>
                    <span className="gw-url-label">{GW_HTTP}</span>
                  </div>
                  {gwPayload&&(
                    <div className="gw-stat-chips">
                      <div className="gw-chip"><span className="gw-chip-lbl">Persons</span><span className="gw-chip-val c-cyan">{gwPayload.person_count}</span></div>
                      <div className="gw-chip"><span className="gw-chip-lbl">Objects</span><span className="gw-chip-val">{gwPayload.detections?.length??0}</span></div>
                      <div className="gw-chip"><span className="gw-chip-lbl">Severity</span>
                        <span className="gw-chip-val" style={{color:gwPayload.max_severity==='high'?'#ff4757':gwPayload.max_severity==='medium'?'#f97316':'#3d5273'}}>{gwPayload.max_severity?.toUpperCase()}</span></div>
                      {gwPayload.turbidity&&(
                        <div className="gw-chip"><span className="gw-chip-lbl">Water</span>
                          <span className="gw-chip-val" style={{color:TURB_COL[gwPayload.turbidity.level]}}>{gwPayload.turbidity.level}   {gwPayload.turbidity.score}/100</span></div>
                      )}
                      <div className="gw-chip"><span className="gw-chip-lbl">Infer</span><span className="gw-chip-val c-muted">{Math.round(gwPayload.processing_ms)}ms</span></div>
                    </div>
                  )}
                  <div className="gw-topstrip-right">
                    <a href={GW_FILE} target="_blank" rel="noreferrer" className="btn-outline sm">{I.expand} Fullscreen</a>
                    <a href={`${GW_HTTP}/docs`} target="_blank" rel="noreferrer" className="btn-outline sm">API </a>
                  </div>
                </div>
                {gwUp?(
                  <iframe className="gw-frame" src={GW_FILE} title="GreenWatch Dashboard" sandbox="allow-scripts allow-same-origin"/>
                ):(
                  <div className="gw-offline-screen">
                    <div className="gw-offline-icon">{I.gw}</div>
                    <h3 className="gw-offline-h">GreenWatch Offline</h3>
                    <p className="gw-offline-p">Start the YOLO inference server to connect</p>
                    <code className="gw-offline-cmd">uvicorn yolo_server:app --host 0.0.0.0 --port 8000</code>
                    <div className="gw-offline-actions">
                      <a href={GW_FILE} target="_blank" rel="noreferrer" className="btn-outline">Open dashboard.html </a>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
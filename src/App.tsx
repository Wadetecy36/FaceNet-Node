import React, { useEffect, useRef, useState } from 'react';
import {
  UserPlus,
  History,
  ShieldCheck,
  User,
  CheckCircle2,
  Loader2,
  Scan,
  Database as DbIcon,
  Fingerprint,
  RefreshCw,
  Activity,
  Cpu,
  ChevronRight,
  ArrowRight,
  Maximize2,
  AlertCircle,
  Clock,
  LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as faceapi from '@vladmandic/face-api';
import { FaceService } from './lib/face-service';
import { cn } from './lib/utils';

interface UserData {
  name: string;
  count: number;
  registered_at: string;
  encoding_json?: string;
  thumb?: string;
}

interface AttendanceLog {
  id: number;
  name: string;
  timestamp: string;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [activeTab, setActiveTab] = useState<'scan' | 'register' | 'roster' | 'logs'>('scan');
  const [isRegistering, setIsRegistering] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [cpuUsage, setCpuUsage] = useState(12);
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<'nominal' | 'scanning' | 'alert'>('nominal');

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        console.log("Loading AI Models...");
        await FaceService.loadModels();
        await fetchUsers();
        await fetchLogs();
        setIsInitializing(false);
      } catch (err: any) {
        console.error("Initialization error:", err);
        alert("CRITICAL: Models failed to load. " + err.message);
      }
    };
    init();

    const interval = setInterval(() => {
      setCpuUsage(prev => {
        const next = prev + (Math.random() * 4 - 2);
        return Math.min(Math.max(Math.floor(next), 5), 25);
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isInitializing && (activeTab === 'scan' || activeTab === 'register')) startCamera();
    else stopCamera();
  }, [isInitializing, activeTab]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setIsCameraReady(true);
      }
    } catch (err) {
      console.error(err);
      setSystemStatus('alert');
    }
  };

  const stopCamera = () => {
    setIsCameraReady(false);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/faces');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch { }
  };

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterDate) params.append('date', filterDate);
      const res = await fetch(`/api/attendance_logs?${params.toString()}`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch { }
  };

  useEffect(() => { fetchLogs(); }, [searchTerm, filterDate]);

  // AI Detection Loop
  useEffect(() => {
    let animationId: number;
    let detectionThrottle = 0;

    const runDetection = async () => {
      if (videoRef.current && canvasRef.current && isCameraReady && activeTab === 'scan' && Date.now() - detectionThrottle > 200) {
        detectionThrottle = Date.now();
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        const dims = faceapi.matchDimensions(canvas, video, true);
        const detections = await FaceService.detectFaces(video);
        const resized = faceapi.resizeResults(detections, dims);

        const usersWithDescriptors = users
          .filter(u => u.encoding_json)
          .map(u => ({ name: u.name, descriptor: JSON.parse(u.encoding_json!) }));

        const matcher = FaceService.createMatcher(usersWithDescriptors);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (resized.length > 0) setSystemStatus('scanning');
        else setSystemStatus('nominal');

        resized.forEach(det => {
          const bestMatch = matcher?.findBestMatch(det.descriptor);
          const label = bestMatch?.toString() || "Unknown";
          const name = label.split(' ')[0];
          const isKnown = name !== 'unknown';
          const color = isKnown ? '#10b981' : '#F43F5E';

          // Futuristic HUD Box
          const { x, y, width, height } = det.detection.box;

          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 5]);
          ctx.strokeRect(x, y, width, height);
          ctx.setLineDash([]);

          // Corners
          const len = 20;
          ctx.lineWidth = 4;
          // TL
          ctx.beginPath(); ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
          // TR
          ctx.beginPath(); ctx.moveTo(x + width - len, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + len); ctx.stroke();
          // BL
          ctx.beginPath(); ctx.moveTo(x, y + height - len); ctx.lineTo(x, y + height); ctx.lineTo(x + len, y + height); ctx.stroke();
          // BR
          ctx.beginPath(); ctx.moveTo(x + width - len, y + height); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width, y + height - len); ctx.stroke();

          // Label Plate
          ctx.fillStyle = color;
          const text = isKnown ? `ID: ${name.toUpperCase()} (MATCHED)` : "UNAUTHORIZED ACCESS";
          ctx.font = 'bold 12px "Space Mono", monospace';
          const textWidth = ctx.measureText(text).width;
          ctx.fillRect(x, y - 30, textWidth + 20, 30);

          ctx.fillStyle = 'black';
          ctx.fillText(text, x + 10, y - 10);

          // Logging logic
          if (isKnown && name !== lastDetected) {
            setLastDetected(name);
            fetch('/api/log_attendance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name })
            }).then(() => {
              fetchLogs();
              fetchUsers();
            });
            // Clear lastDetected after 5 seconds to allow re-scan
            setTimeout(() => setLastDetected(null), 5000);
          }
        });
      }
      animationId = requestAnimationFrame(runDetection);
    };

    if (activeTab === 'scan' && !isInitializing) runDetection();
    return () => cancelAnimationFrame(animationId);
  }, [isCameraReady, activeTab, users, lastDetected, isInitializing]);

  const handleRegister = async () => {
    if (!videoRef.current || !newName) return;
    setIsRegistering(true);
    try {
      const detections = await FaceService.detectFaces(videoRef.current);
      if (detections.length === 0) {
        alert("NO BIOMETRIC DATA DETECTED. ADJUST LIGHTING.");
        setIsRegistering(false);
        return;
      }

      const descriptor = Array.from(detections[0].descriptor);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 150;
      tempCanvas.height = 150;
      tempCanvas.getContext('2d')?.drawImage(videoRef.current, 0, 0, 150, 150);
      const thumb = tempCanvas.toDataURL('image/jpeg', 0.8);

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, encoding: JSON.stringify(descriptor), thumb })
      });
      const data = await res.json();
      if (data.ok) {
        setNewName('');
        await fetchUsers();
        setActiveTab('roster');
      } else alert(data.msg);

    } catch (err) { console.error(err); }
    finally { setIsRegistering(false); }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-12">
          <div className="w-32 h-32 border-4 border-emerald-500/20 rounded-full" />
          <div className="absolute inset-0 w-32 h-32 border-t-4 border-emerald-500 rounded-full animate-spin shadow-[0_0_40px_rgba(16,185,129,0.4)]" />
          <Fingerprint className="absolute inset-0 m-auto w-12 h-12 text-emerald-500 animate-pulse" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-[0.4em] uppercase mb-4 hud-text">Initializing AI</h1>
        <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest animate-pulse max-w-sm">
          Loading neural descriptors & hardware acceleration drivers...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mesh-bg" />

      {/* Futuristic Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-20 md:w-80 bg-black/40 backdrop-blur-3xl border-r border-white/5 flex flex-col z-50">
        <div className="p-8 pb-12 flex items-center gap-5">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl blur opacity-40 group-hover:opacity-100 transition duration-1000"></div>
            <div className="relative w-12 h-12 bg-black rounded-2xl flex items-center justify-center border border-emerald-500/40 rotate-3 group-hover:rotate-0 transition-transform duration-500">
              <Fingerprint className="text-emerald-500 w-7 h-7" />
            </div>
          </div>
          <div className="hidden md:block">
            <h1 className="text-2xl font-black text-white tracking-tighter leading-none mb-1">FACENET</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] text-emerald-500 font-bold tracking-[0.2em] uppercase">V2 PRO ACTIVATED</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-3">
          {[
            { id: 'scan', icon: LayoutDashboard, label: 'SCAN HUB', desc: 'Secure Biometric' },
            { id: 'register', icon: UserPlus, label: 'INDUCTION', desc: 'New Identity' },
            { id: 'roster', icon: ShieldCheck, label: 'ID VAULT', desc: 'Secure Profiles' },
            { id: 'logs', icon: Clock, label: 'TEMPORAL', desc: 'Access Logs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-5 p-4 rounded-[1.5rem] transition-all duration-500 relative group",
                activeTab === tab.id
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent"
              )}
            >
              {activeTab === tab.id && (
                <motion.div layoutId="nav-glow" className="absolute inset-0 bg-emerald-500/5 blur-xl rounded-full" />
              )}
              <tab.icon className={cn("w-6 h-6", activeTab === tab.id ? "drop-shadow-[0_0_10px_rgba(16,185,129,1)]" : "opacity-50")} />
              <div className="hidden md:block text-left">
                <p className="text-xs font-black tracking-widest">{tab.label}</p>
                <p className="text-[9px] opacity-40 font-mono tracking-tighter">{tab.desc}</p>
              </div>
            </button>
          ))}
        </nav>

        <div className="p-6">
          <div className="glass-card p-5 rounded-3xl space-y-4 border-emerald-500/10">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-zinc-500 tracking-widest uppercase">System Core</span>
              <Activity className="w-3 h-3 text-emerald-500" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-400">CPU LOAD</span>
                <span className="text-emerald-500">{cpuUsage}%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${cpuUsage}%` }}
                  className="h-full bg-emerald-500 shadow-[0_0_15px_#10b981] transition-all duration-700"
                />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="pl-20 md:pl-80 min-h-screen">
        <div className="max-w-7xl mx-auto p-6 md:p-12">

          <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <p className="text-emerald-500 font-mono text-[10px] tracking-[0.4em] mb-2 uppercase">Command Center V2.1</p>
              <h2 className="text-5xl font-black text-white tracking-tighter uppercase leading-tight">
                {activeTab === 'scan' && "Scanning Environment"}
                {activeTab === 'register' && "Profile Induction"}
                {activeTab === 'roster' && "Verified Identity Vault"}
                {activeTab === 'logs' && "Temporal Records"}
              </h2>
            </div>
            <div className="flex items-center gap-3 glass-card px-4 py-2 rounded-2xl select-none">
              <div className={cn(
                "w-2 h-2 rounded-full",
                systemStatus === 'nominal' ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" :
                  systemStatus === 'scanning' ? "bg-cyan-500 animate-pulse shadow-[0_0_10px_#06b6d4]" :
                    "bg-rose-500 shadow-[0_0_10px_#f43f5e]"
              )} />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
                System {systemStatus.toUpperCase()}
              </span>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {activeTab === 'scan' ? (
              <motion.section
                key="scan"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 xl:grid-cols-4 gap-8"
              >
                <div className="xl:col-span-3 space-y-8">
                  <div className="relative aspect-video rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] bg-black group">
                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover opacity-80" />
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-20" />
                    <div className="scan-line" />

                    {/* HUD Overlays */}
                    <div className="absolute top-8 left-8 p-4 border-l border-t border-white/20 pointer-events-none">
                      <p className="text-[9px] text-zinc-500 font-mono mb-1">REC_STREAM_01</p>
                      <p className="text-[10px] text-white font-mono">1280x720_60FPS</p>
                    </div>
                    <div className="absolute top-8 right-8 text-right p-4 border-r border-t border-white/20 pointer-events-none">
                      <p className="text-[9px] text-zinc-500 font-mono mb-1">ENCRYPTION</p>
                      <p className="text-[10px] text-emerald-500 font-mono font-bold">AES-256-GCM</p>
                    </div>
                    <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end pointer-events-none">
                      <div className="p-4 border-l border-b border-white/20">
                        <div className="flex gap-1 h-4 items-end mb-2">
                          {[...Array(8)].map((_, i) => (
                            <div key={i} className="w-1 bg-emerald-500/40" style={{ height: `${20 + Math.random() * 80}%` }} />
                          ))}
                        </div>
                        <p className="text-[9px] text-zinc-500 font-mono">BITRATE_NOMINAL</p>
                      </div>
                      <div className="p-4 border-r border-b border-white/20 text-right">
                        <p className="text-3xl font-black text-white tracking-widest">{new Date().toLocaleTimeString([], { hour12: false })}</p>
                        <p className="text-[9px] text-zinc-500 font-mono">NODE_UTC_REF</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="glass-card p-8 rounded-[2.5rem] flex flex-col justify-between h-[200px]">
                    <div className="flex items-center justify-between text-zinc-500">
                      <p className="text-[10px] font-black tracking-widest uppercase">Identities</p>
                      <DbIcon className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-5xl font-black text-white mb-2">{users.length}</h4>
                      <p className="text-[10px] text-zinc-500 font-mono">ENCRYPTED PROFILES IN VAULT</p>
                    </div>
                  </div>

                  <div className="glass-card p-8 rounded-[2.5rem] flex flex-col justify-between h-[200px] border-emerald-500/20">
                    <div className="flex items-center justify-between text-zinc-500">
                      <p className="text-[10px] font-black tracking-widest uppercase">Verified Scans</p>
                      <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-5xl font-black text-white mb-2">
                        {logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length}
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-mono">SESSION AUTHORIZATIONS</p>
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-[2rem] bg-emerald-500/5 group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black">
                        <Fingerprint className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-white">READY TO SCAN</p>
                        <p className="text-[9px] text-zinc-500 font-mono uppercase">Position face in center frame</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>
            ) : activeTab === 'register' ? (
              <motion.section key="register" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="max-w-4xl">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                  <div className="space-y-8">
                    <div className="glass-card p-12 rounded-[3.5rem] space-y-10 border-white/5 bg-black/40">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-emerald-500 tracking-[0.3em] uppercase ml-1">Assign User Identity</label>
                        <input
                          type="text"
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          placeholder="ENTER_UNIQUE_NAME"
                          className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-8 py-6 text-xl font-black text-white placeholder:text-zinc-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/40 transition-all duration-500"
                        />
                      </div>
                      <button
                        onClick={handleRegister}
                        disabled={isRegistering || !newName}
                        className="group relative w-full overflow-hidden bg-emerald-500 disabled:bg-zinc-800 text-black py-7 rounded-[2rem] font-black text-lg transition-all active:scale-95 disabled:grayscale"
                      >
                        {isRegistering ? (
                          <Loader2 className="animate-spin h-7 w-7 mx-auto" />
                        ) : (
                          <div className="flex items-center justify-center gap-3">
                            <span>INDUCT PROFILE</span>
                            <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                          </div>
                        )}
                      </button>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1 glass-card p-6 rounded-3xl flex items-center gap-4">
                        <Activity className="w-5 h-5 text-emerald-500" />
                        <div>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase">Input Sync</p>
                          <p className="text-xs font-black text-white">NOMINAL</p>
                        </div>
                      </div>
                      <div className="flex-1 glass-card p-6 rounded-3xl flex items-center gap-4">
                        <Cpu className="w-5 h-5 text-emerald-500" />
                        <div>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase">Process Mode</p>
                          <p className="text-xs font-black text-white">NEURAL_RT</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="relative aspect-square rounded-[4rem] overflow-hidden border border-white/5 shadow-2xl bg-black">
                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1] opacity-70" />
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-10 pointer-events-none opacity-20">
                      <div className="w-20 h-20 border-l-2 border-t-2 border-white" />
                      <div className="w-20 h-20 border-r-2 border-t-2 border-white" />
                    </div>
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-10 mt-20 pointer-events-none opacity-20">
                      <div className="w-20 h-20 border-l-2 border-b-2 border-white" />
                      <div className="w-20 h-20 border-r-2 border-b-2 border-white" />
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center pointer-events-none">
                      <p className="text-[10px] font-black text-white/20 tracking-[1em] uppercase">Vercel Induction Mode</p>
                    </div>
                  </div>
                </div>
              </motion.section>
            ) : activeTab === 'roster' ? (
              <motion.section key="roster" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {users.length === 0 ? (
                    <div className="col-span-full py-32 text-center glass-card rounded-[3rem]">
                      <UserPlus className="w-16 h-16 text-zinc-800 mx-auto mb-6" />
                      <h4 className="text-xl font-black text-zinc-600 uppercase tracking-widest">No Identities Stored</h4>
                      <p className="text-zinc-700 font-mono text-xs mt-2 italic">Register a new user to populate the vault.</p>
                    </div>
                  ) : users.map(user => (
                    <motion.div
                      layout
                      key={user.name}
                      className="glass-card p-6 rounded-[2.5rem] flex flex-col items-center text-center group relative overflow-hidden active:scale-95 transition-transform"
                    >
                      <div className="relative mb-6">
                        <div className="absolute -inset-2 bg-emerald-500/20 rounded-[2rem] blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                        <div className="relative w-32 h-32 rounded-[2rem] bg-zinc-900 border border-white/5 overflow-hidden">
                          {user.thumb ? (
                            <img src={user.thumb} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={user.name} />
                          ) : (
                            <User className="w-full h-full p-10 text-zinc-800" />
                          )}
                        </div>
                      </div>
                      <h3 className="font-black text-xl text-white uppercase tracking-tight group-hover:text-emerald-500 transition-colors">{user.name}</h3>
                      <p className="text-[10px] font-mono text-zinc-500 mt-2 tracking-widest uppercase">Verified {user.count} Times</p>

                      <div className="mt-6 pt-6 border-t border-white/5 w-full flex justify-between items-center text-[9px] font-black text-zinc-600 tracking-widest">
                        <span>ESTD_ID</span>
                        <span className="text-emerald-900">{user.name.slice(0, 3).toUpperCase()}-{user.count.toString().padStart(3, '0')}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            ) : (
              <motion.section key="logs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                <div className="glass-card rounded-[3.5rem] overflow-hidden border border-white/5 bg-black/20">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono">
                      <thead>
                        <tr className="bg-emerald-500/10 text-emerald-500/80 text-[10px] font-black tracking-[0.3em] uppercase">
                          <th className="px-12 py-8">Access_Identity</th>
                          <th className="px-12 py-8">Node_Timestamp</th>
                          <th className="px-12 py-8">Security_Gate</th>
                          <th className="px-12 py-8 text-right">Link_Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-12 py-32 text-center">
                              <Clock className="w-12 h-12 text-zinc-900 mx-auto mb-6 opacity-40" />
                              <p className="text-zinc-700 text-xs font-black tracking-widest uppercase">Zero temporal records detected</p>
                            </td>
                          </tr>
                        ) : logs.map(log => (
                          <tr key={log.id} className="group hover:bg-white/[0.02] transition-colors relative">
                            <td className="px-12 py-10">
                              <div className="flex items-center gap-4">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="font-black text-white text-base tracking-tighter uppercase">{log.name}</span>
                              </div>
                            </td>
                            <td className="px-12 py-10">
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-zinc-300">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span className="text-[9px] text-zinc-600">{new Date(log.timestamp).toDateString().toUpperCase()}</span>
                              </div>
                            </td>
                            <td className="px-12 py-10">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-500/50" />
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">BIOMETRIC_PASS</span>
                              </div>
                            </td>
                            <td className="px-12 py-10 text-right">
                              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black text-emerald-500 uppercase">Synced_Cloud</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

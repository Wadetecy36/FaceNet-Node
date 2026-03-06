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
  ArrowRight
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

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        await FaceService.loadModels();
        await fetchUsers();
        await fetchLogs();
        setIsInitializing(false);
      } catch (err) { console.error("Initialization error:", err); }
    };
    init();

    const interval = setInterval(() => {
      setCpuUsage(Math.floor(Math.random() * 15) + 5);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isInitializing && (activeTab === 'scan' || activeTab === 'register')) startCamera();
    else stopCamera();
  }, [isInitializing, activeTab]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setIsCameraReady(true);
      }
    } catch (err) { console.error(err); }
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
      setUsers(data);
    } catch { }
  };

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterDate) params.append('date', filterDate);
      const res = await fetch(`/api/attendance_logs?${params.toString()}`);
      setLogs(await res.json());
    } catch { }
  };

  useEffect(() => { fetchLogs(); }, [searchTerm, filterDate]);

  // Client-Side AI Pipeline
  useEffect(() => {
    let animationId: number;
    let detectionThrottle = 0;

    const runDetection = async () => {
      if (videoRef.current && canvasRef.current && isCameraReady && activeTab === 'scan' && Date.now() - detectionThrottle > 150) {
        detectionThrottle = Date.now();
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const dims = faceapi.matchDimensions(canvas, video, true);
        const detections = await FaceService.detectFaces(video);
        const resized = faceapi.resizeResults(detections, dims);

        const usersWithDescriptors = users
          .filter(u => u.encoding_json)
          .map(u => ({ name: u.name, descriptor: JSON.parse(u.encoding_json!) }));

        const matcher = FaceService.createMatcher(usersWithDescriptors);

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          resized.forEach(det => {
            const bestMatch = matcher?.findBestMatch(det.descriptor);
            const label = bestMatch?.toString() || "Unknown";
            const name = label.split(' ')[0];
            const color = name === 'unknown' ? '#ef4444' : '#10b981';

            // HUD Drawing
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            const { x, y, width, height } = det.detection.box;
            ctx.strokeRect(x, y, width, height);

            // Label
            ctx.fillStyle = color;
            ctx.font = 'bold 14px "Space Mono"';
            ctx.fillRect(x, y - 25, ctx.measureText(label.toUpperCase()).width + 10, 25);
            ctx.fillStyle = 'black';
            ctx.fillText(label.toUpperCase(), x + 5, y - 8);

            // Cloud Logging
            if (name !== 'unknown' && name !== lastDetected) {
              setLastDetected(name);
              fetch('/api/log_attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
              }).then(() => {
                fetchLogs();
                fetchUsers();
              });
            }
          });
        }
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
        alert("NO FACE DETECTED");
        setIsRegistering(false);
        return;
      }

      const descriptor = Array.from(detections[0].descriptor);

      // Thumb
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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-6">
        <div className="w-24 h-24 border-t-4 border-emerald-500 rounded-full animate-spin shadow-[0_0_50px_rgba(16,185,129,0.3)]" />
        <h1 className="text-emerald-500 font-mono text-sm tracking-[0.5em] animate-pulse">INIT_NEURAL_MODELS...</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      <div className="mesh-bg" />

      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 h-full w-24 md:w-72 bg-black/40 backdrop-blur-3xl border-r border-white/5 flex flex-col z-50">
        <div className="p-8 flex items-center gap-4 border-b border-white/5">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)] flex-shrink-0 rotate-3">
            <Fingerprint className="text-black w-7 h-7" />
          </div>
          <div className="hidden md:block">
            <h1 className="text-xl font-black bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent uppercase">Facenet V2</h1>
            <p className="text-[10px] text-emerald-500 font-bold tracking-[0.3em] uppercase">Vercel Pro Mode</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 mt-6">
          {[
            { id: 'scan', icon: Scan, label: 'Live Scanner', desc: 'Secure Biometric Scan' },
            { id: 'register', icon: UserPlus, label: 'Registration', desc: 'Identity Induction' },
            { id: 'roster', icon: User, label: 'Vault', desc: 'Encrypted Identities' },
            { id: 'logs', icon: History, label: 'Audit Logs', desc: 'Temporal Records' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 relative group",
                activeTab === tab.id
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                  : "text-zinc-500 hover:text-white hover:bg-white/5"
              )}
            >
              <tab.icon className={cn("w-6 h-6", activeTab === tab.id ? "drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "")} />
              <div className="hidden md:block text-left">
                <p className="text-sm font-bold tracking-tight">{tab.label}</p>
                <p className="text-[10px] opacity-60 font-mono italic">{tab.desc}</p>
              </div>
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-white/5">
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-2 uppercase">
              <span>Unit Load</span>
              <span className="text-emerald-500">{cpuUsage}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div style={{ width: `${cpuUsage}%` }} className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981] transition-all duration-1000" />
            </div>
          </div>
        </div>
      </aside>

      <main className="pl-24 md:pl-72 min-h-screen">
        <div className="max-w-6xl mx-auto p-6 md:p-12">

          <AnimatePresence mode="wait">
            {activeTab === 'scan' ? (
              <motion.section key="scan" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="space-y-8">
                <div>
                  <h2 className="text-4xl font-black tracking-tighter mb-2">SCAN STATION</h2>
                  <p className="text-zinc-500 font-mono text-sm">CLIENT-SIDE SECURE BIOMETRIC INTERFACE</p>
                </div>

                <div className="relative aspect-video rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)] bg-black">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover brightness-75" />
                  <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-20" />
                  <div className="scan-line" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-card p-8 rounded-[2rem] space-y-4">
                    <div className="flex items-center justify-between text-zinc-500">
                      <h4 className="text-xs font-bold uppercase tracking-widest">Vault Size</h4>
                      <DbIcon className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-4xl font-black">{users.length}</p>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase">Registered IDs</p>
                  </div>
                  <div className="glass-card p-8 rounded-[2rem] space-y-4">
                    <div className="flex items-center justify-between text-zinc-500">
                      <h4 className="text-xs font-bold uppercase tracking-widest">Logs Today</h4>
                      <Activity className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-4xl font-black">{logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length}</p>
                  </div>
                  <div className="glass-card p-8 rounded-[2rem] space-y-4">
                    <h4 className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Network</h4>
                    <p className="text-4xl font-black text-emerald-500">SECURE</p>
                  </div>
                </div>
              </motion.section>
            ) : activeTab === 'register' ? (
              <motion.section key="register" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <div className="max-w-2xl">
                  <h2 className="text-4xl font-black tracking-tighter mb-4">IDENTITY INDUCTION</h2>
                  <p className="text-zinc-500 font-mono text-sm mb-12 uppercase">Create a new biometric profile.</p>

                  <div className="glass-card p-12 rounded-[2.5rem] space-y-8 relative overflow-hidden">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-emerald-500 font-mono uppercase tracking-widest">Inductee Name</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="NAME_REQUIRED"
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={handleRegister}
                        disabled={isRegistering || !newName}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-6 rounded-3xl font-black flex items-center justify-center gap-3 shadow-[0_20px_40px_rgba(16,185,129,0.2)] disabled:opacity-50 transition-all"
                      >
                        {isRegistering ? <Loader2 className="animate-spin h-6 w-6" /> : "ENROLL NOW"}
                      </button>
                      <div className="aspect-video bg-black/40 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-zinc-600">
                        <Scan className="w-10 h-10 opacity-20" />
                        <span className="text-[10px] font-mono">NEURAL_READY</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>
            ) : activeTab === 'roster' ? (
              <motion.section key="roster" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <h2 className="text-4xl font-black tracking-tighter mb-2">IDENTITY VAULT</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {users.map(user => (
                    <div key={user.name} className="glass-card p-6 rounded-[2rem] flex items-center gap-6 group relative overflow-hidden">
                      <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-white/5 overflow-hidden">
                        {user.thumb ? <img src={user.thumb} className="w-full h-full object-cover" /> : <User className="p-4" />}
                      </div>
                      <div>
                        <h3 className="font-black text-emerald-500 uppercase">{user.name}</h3>
                        <p className="text-[10px] font-mono text-zinc-500">SCANS: {user.count}</p>
                      </div>
                      <ChevronRight className="ml-auto w-5 h-5 text-zinc-700" />
                    </div>
                  ))}
                </div>
              </motion.section>
            ) : (
              <motion.section key="logs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <h2 className="text-4xl font-black tracking-tighter mb-2 uppercase">Audit Records</h2>
                </div>

                <div className="glass-card rounded-[2.5rem] overflow-hidden border border-white/5">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-white/5 text-zinc-500 uppercase">
                      <tr>
                        <th className="px-8 py-5">Identity_Name</th>
                        <th className="px-8 py-5">Timestamp_UTC</th>
                        <th className="px-8 py-5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {logs.map(log => (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors uppercase">
                          <td className="px-8 py-5 font-black text-sm">{log.name}</td>
                          <td className="px-8 py-5 text-zinc-500">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="px-8 py-5"><span className="text-emerald-500">VERIFIED_BIO</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

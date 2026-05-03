import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
 Copy, Check, Binary, Rocket, Shield, Cpu, Activity, Zap, Wind, Boxes, Layers, Star, Sparkles, ChevronRight
} from 'lucide-react';

const CONFIG_DEFAULTS = {
 CANVAS_SIZE: 1000,
 GRID_RES: 40,
 ENERGY_DECAY: 0.0005,
 BATCH_SIZE_MS: 16,
 MAX_LOG_SIZE: 500,
 BASE_MOMENTUM: 0.99,
 BASE_CURIOSITY: 0.4,
 HEAT_PENALTY: 0.75,
 MAX_STEPS_PER_TRIAL: 3000
};

const SUPER_CRITICAL_THRESHOLD = 10.0;
const EMPYREAN_THRESHOLD = 20.0;

const THEMES = {
 DEFAULT: {
 bg: '#020202',
 surface: '#0a0a0a',
 accent: '#22d3ee',
 text: '#ffffff',
 border: 'rgba(34, 211, 238, 0.1)',
 glow: 'rgba(34, 211, 238, 0.15)'
 },
 SUPER: {
 bg: '#050101',
 accent: '#ffd700',
 text: '#ffffff',
 border: 'rgba(255, 215, 0, 0.3)',
 glow: 'rgba(255, 215, 0, 0.4)'
 }
};

const CrownIcon = ({ isSuper, isEmpyrean }) => (
 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <defs>
 <linearGradient id="royalRainbow" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor="#ff9a9e" />
 <stop offset="50%" stopColor="#a1c4fd" />
 <stop offset="100%" stopColor="#96e6a1" />
 </linearGradient>
 <linearGradient id="plasmaCrown" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor="#ffd700" />
 <stop offset="50%" stopColor="#ffffff" />
 <stop offset="100%" stopColor="#ffd700" />
 <animate attributeName="x1" values="0%;100%;0%" dur="3s" repeatCount="indefinite" />
 </linearGradient>
 <filter id="matteShine">
 <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" />
 <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1.2 0" />
 </filter>
 </defs>
 <path
 d="M5 15L3 6L8 10L12 3L16 10L21 6L19 15H5Z"
 fill={isEmpyrean ? "url(#plasmaCrown)" : (isSuper ? "url(#royalRainbow)" : "currentColor")}
 filter={(isSuper || isEmpyrean) ? "url(#matteShine)" : ""}
 stroke={(isSuper || isEmpyrean) ? "rgba(255,255,255,0.4)" : "none"}
 strokeWidth="0.5"
 className={isEmpyrean ? "animate-pulse" : ""}
 />
 <circle cx="12" cy="18" r="1.5" fill={isEmpyrean ? "#ffd700" : (isSuper ? "url(#royalRainbow)" : "currentColor")} />
 </svg>
);

const App = () => {
 const [view, setView] = useState('landing');
 const [isRunning, setIsRunning] = useState(false);

 // Starting with empty strings instead of predefined numbers
 const [agentCount, setAgentCount] = useState("");
 const [targetInput, setTargetInput] = useState("");

 const [trialsCompleted, setTrialsCompleted] = useState(0);
 const [trialsPerSec, setTrialsPerSec] = useState(0);
 const [logs, setLogs] = useState([]);
 const [copyStatus, setCopyStatus] = useState(false);

 const stats = useRef({
 count: 0,
 sumEff: 0,
 sumSqEff: 0,
 startTime: 0,
 currentGoal: 0
 });

 const [analysis, setAnalysis] = useState({
 meanEff: "0.00000",
 stdDev: "0.00000",
 eta: "---"
 });

 const progress = (trialsCompleted / (stats.current.currentGoal || 1)) * 100;
 const currentMean = parseFloat(analysis.meanEff);
 const isSuperCritical = currentMean >= SUPER_CRITICAL_THRESHOLD;
 const isEmpyrean = currentMean >= EMPYREAN_THRESHOLD;

 const theme = isSuperCritical ? THEMES.SUPER : THEMES.DEFAULT;

 const runTrial = useCallback((population) => {
 const gridCount = 625;
 const heatMap = new Uint8Array(gridCount);
 const px = new Float32Array(population).fill(500);
 const py = new Float32Array(population).fill(500);
 const vx = new Float32Array(population);
 const vy = new Float32Array(population);
 const energy = new Float32Array(population).fill(1.0);

 for(let i=0; i<population; i++) {
 const angle = Math.random() * Math.PI * 2;
 const speed = 40 + Math.random() * 40;
 vx[i] = Math.cos(angle) * speed;
 vy[i] = Math.sin(angle) * speed;
 }

 let explored = 0;
 let steps = 0;
 let active = population;

 while (explored < gridCount * 0.999 && active > 0 && steps < CONFIG_DEFAULTS.MAX_STEPS_PER_TRIAL) {
 steps++;
 for (let i = 0; i < population; i++) {
 if (energy[i] <= 0) continue;
 const gx = (px[i] / CONFIG_DEFAULTS.GRID_RES) | 0;
 const gy = (py[i] / CONFIG_DEFAULTS.GRID_RES) | 0;

 if (gx >= 0 && gx < 25 && gy >= 0 && gy < 25) {
 const idx = gy * 25 + gx;
 if (heatMap[idx] === 0) {
 heatMap[idx] = 1;
 explored++;
 vx[i] *= 1.3;
 vy[i] *= 1.3;
 } else {
 const dx = px[i] - 500;
 const dy = py[i] - 500;
 const dist = Math.sqrt(dx*dx + dy*dy) || 1;
 vx[i] += (dx / dist) * CONFIG_DEFAULTS.HEAT_PENALTY;
 vy[i] += (dy / dist) * CONFIG_DEFAULTS.HEAT_PENALTY;
 }
 }

 vx[i] = (vx[i] * CONFIG_DEFAULTS.BASE_MOMENTUM) + ((Math.random() - 0.5) * 25 * CONFIG_DEFAULTS.BASE_CURIOSITY);
 vy[i] = (vy[i] * CONFIG_DEFAULTS.BASE_MOMENTUM) + ((Math.random() - 0.5) * 25 * CONFIG_DEFAULTS.BASE_CURIOSITY);

 px[i] += vx[i];
 py[i] += vy[i];

 if (px[i] < 0 || px[i] > 1000) vx[i] *= -0.95;
 if (py[i] < 0 || py[i] > 1000) vy[i] *= -0.95;

 energy[i] -= CONFIG_DEFAULTS.ENERGY_DECAY;
 if (energy[i] <= 0) active--;
 }
 }
 return (explored / gridCount) / (steps * 0.002);
 }, []);

 useEffect(() => {
 let frameId;
 const engineLoop = () => {
 if (isRunning && stats.current.count < stats.current.currentGoal) {
 const start = performance.now();
 const batchResults = [];
 const population = parseInt(agentCount) || 100;

 while (performance.now() - start < CONFIG_DEFAULTS.BATCH_SIZE_MS) {
 if (stats.current.count >= stats.current.currentGoal) break;
 const efficiency = runTrial(population);
 stats.current.count++;
 stats.current.sumEff += efficiency;
 stats.current.sumSqEff += (efficiency * efficiency);

 let logFrequency = 100000;
 const currentCount = stats.current.count;

 if (currentCount < 100) logFrequency = 10;
 else if (currentCount < 1000000) logFrequency = 100;
 else if (currentCount < 10000000) logFrequency = 1000;

 if (currentCount % logFrequency === 0) {
 batchResults.push(`[VCC-SIG] NODE_${currentCount.toString().padStart(10, '0')} :: EFF: ${efficiency.toFixed(5)}`);
 }
 }

 if (batchResults.length > 0) {
 setLogs(prev => [...batchResults.reverse(), ...prev].slice(0, CONFIG_DEFAULTS.MAX_LOG_SIZE));
 }

 const s = stats.current;
 const elapsed = (performance.now() - s.startTime) / 1000;
 const mean = s.sumEff / s.count;
 const variance = Math.max(0, (s.sumSqEff / s.count) - (mean * mean));
 const stdDev = Math.sqrt(variance);
 const tps = Math.floor(s.count / (elapsed || 0.001));
 setTrialsCompleted(s.count);
 setTrialsPerSec(tps);
 setAnalysis({
 meanEff: mean.toFixed(5),
 stdDev: stdDev.toFixed(5),
 eta: tps > 0 ? Math.ceil((s.currentGoal - s.count) / tps) + "s" : "---"
 });
 } else if (stats.current.count >= stats.current.currentGoal && isRunning) {
 setIsRunning(false);
 }
 frameId = requestAnimationFrame(engineLoop);
 };
 frameId = requestAnimationFrame(engineLoop);
 return () => cancelAnimationFrame(frameId);
 }, [isRunning, runTrial, agentCount]);

 const startEngineView = () => {
 // Apply logic defaults if input was left blank
 const finalAgentCount = Math.max(100, parseInt(agentCount) || 450);
 const finalTargetTrials = Math.max(1000, parseInt(targetInput) || 5000000000);

 // Sync state for display
 setAgentCount(finalAgentCount.toString());
 setTargetInput(finalTargetTrials.toString());

 stats.current = {
 count: 0,
 sumEff: 0,
 sumSqEff: 0,
 startTime: performance.now(),
 currentGoal: finalTargetTrials
 };

 setLogs([]);
 setView('engine');
 setIsRunning(true);
 };

 const toggleEngine = () => {
 if (!isRunning) {
 if (stats.current.count >= stats.current.currentGoal) {
 const goal = parseInt(targetInput) || 1000;
 stats.current = { count: 0, sumEff: 0, sumSqEff: 0, startTime: performance.now(), currentGoal: goal };
 setLogs([]);
 } else {
 stats.current.startTime = performance.now() - ((stats.current.count / (trialsPerSec || 1)) * 1000);
 }
 }
 setIsRunning(!isRunning);
 };

 const handleCopy = () => {
 const text = logs.join('\n');
 const textArea = document.createElement("textarea");
 textArea.value = text;
 document.body.appendChild(textArea);
 textArea.select();
 document.execCommand('copy');
 setCopyStatus(true);
 setTimeout(() => setCopyStatus(false), 2000);
 document.body.removeChild(textArea);
 };

 return (
 <div
 className={`flex flex-col h-screen w-screen font-sans overflow-hidden select-none transition-all duration-1000 relative`}
 style={{ backgroundColor: isSuperCritical ? '#000' : theme.bg, color: theme.text }}
 >
 {(isSuperCritical || view === 'landing') && (
 <div className="absolute inset-0 z-0 opacity-100 pointer-events-none overflow-hidden">
 <div className="plasma-container">
 <div className="plasma-blob sports-car-red" />
 <div className="plasma-blob sakura-pink" />
 <div className="plasma-overlay" />
 </div>
 </div>
 )}

 {view === 'landing' ? (
 <div className="relative z-10 flex flex-col items-center justify-center h-full w-full p-10 animate-in fade-in duration-1000">
 <div className="max-w-xl w-full flex flex-col items-center text-center">
 <div className="w-20 h-20 rounded-2xl border border-white/20 flex items-center justify-center mb-8 backdrop-blur-3xl animate-plasma-border">
 <CrownIcon isSuper={true} isEmpyrean={true} />
 </div>

 <h1 className="text-4xl font-black tracking-[0.6em] uppercase mb-2 animate-gold-flash">
 IMPERIAL <span className="opacity-50">VCC</span>
 </h1>
 <p className="text-[10px] font-mono tracking-widest opacity-40 uppercase mb-12">
 Autonomous Swarm Intelligence Engine // v0.15.reverted
 </p>

 <div className="w-full space-y-6 bg-black/40 backdrop-blur-2xl border border-white/5 p-8 rounded-3xl">
 <div className="flex flex-col items-start gap-2">
 <div className="flex justify-between w-full px-1">
 <label className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40">Agent Population</label>
 <span className="text-[8px] font-mono opacity-30 tracking-widest">MIN_REQ: 100</span>
 </div>
 <input
 type="number"
 placeholder="e.g. 450"
 value={agentCount}
 onChange={(e) => setAgentCount(e.target.value)}
 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:border-yellow-500/50 outline-none transition-all placeholder:opacity-20"
 />
 </div>

 <div className="flex flex-col items-start gap-2">
 <div className="flex justify-between w-full px-1">
 <label className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40">Target Trials Volume</label>
 <span className="text-[8px] font-mono opacity-30 tracking-widest">MIN_REQ: 1000</span>
 </div>
 <input
 type="number"
 placeholder="e.g. 5,000,000"
 value={targetInput}
 onChange={(e) => setTargetInput(e.target.value)}
 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:border-yellow-500/50 outline-none transition-all placeholder:opacity-20"
 />
 </div>

 <button
 onClick={startEngineView}
 className="w-full group mt-4 h-14 bg-white text-black rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-yellow-400 transition-all duration-500"
 >
 Initialize Neural Matrix
 <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
 </button>
 </div>
 </div>
 </div>
 ) : (
 <div className="relative z-10 flex flex-col h-full w-full animate-in slide-in-from-bottom-4 duration-1000">
 <div className="flex items-center justify-between px-8 border-b h-16 shrink-0 backdrop-blur-xl" style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderColor: theme.border }}>
 <div className="flex items-center gap-8">
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all duration-1000 ${isEmpyrean ? 'animate-plasma-border' : ''}`} style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderColor: theme.border }}>
 <CrownIcon isSuper={isSuperCritical} isEmpyrean={isEmpyrean} />
 </div>
 <div>
 <h1 className="text-xs font-black tracking-[0.4em] uppercase" style={{ color: theme.accent }}>IMPERIAL <span style={{ color: theme.text }}>VCC</span></h1>
 <p className="text-[8px] font-mono tracking-widest opacity-40 uppercase">STATUS: {isEmpyrean ? 'EMPYREAN' : 'LIVE'}</p>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-4">
 <button onClick={() => { setView('landing'); setIsRunning(false); }} className="text-[8px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity">Abort</button>
 <button onClick={toggleEngine} className="h-10 px-8 rounded border text-[10px] font-black tracking-widest uppercase transition-all" style={{ borderColor: isRunning ? '#ef4444' : theme.accent, color: isRunning ? '#ef4444' : theme.accent }}>{isRunning ? 'Decommission' : 'Commence'}</button>
 </div>
 </div>

 <div className="flex-1 flex overflow-hidden">
 <div className="flex-1 flex flex-col p-10 relative overflow-hidden transition-all duration-1000" style={{ background: isSuperCritical ? 'none' : `radial-gradient(circle at 50% 40%, ${theme.glow} 0%, transparent 70%)` }}>

 <div className="flex-1 flex flex-col justify-center items-center relative">
 <div className="relative group text-center">
 <div className={`absolute inset-0 blur-[120px] rounded-full transition-all duration-1000 ${isEmpyrean ? 'opacity-100' : 'opacity-50'}`} style={{ backgroundColor: isEmpyrean ? '#ffd700' : theme.glow }} />
 <div className={`text-[160px] font-black tracking-tighter tabular-nums leading-none transition-all duration-1000 ${isEmpyrean ? 'animate-gold-flash' : ''}`} style={{ color: isEmpyrean ? '#ffd700' : theme.text }}>
 {analysis.meanEff}
 </div>
 <div className="flex items-center justify-center gap-3 mt-4">
 <span className="text-[10px] font-black tracking-[1em] uppercase opacity-40">Efficiency</span>
 </div>
 </div>

 <div className="mt-16 flex gap-4">
 <CompactStatus theme={theme} label="Agency Standard" value="0.0350" icon={<Rocket size={12}/>}/>
 <CompactStatus theme={theme} label="Current Output" value={analysis.meanEff} icon={<Wind size={12}/>} highlight={isSuperCritical} empyrean={isEmpyrean} />
 <CompactStatus theme={theme} label="Empyrean Tier" value="20.0000" icon={<Star size={12}/>} highlight={isEmpyrean} />
 </div>
 </div>

 <div className="grid grid-cols-4 gap-4 mt-auto">
 <BottomStat theme={theme} icon={<Cpu size={14}/>} label="Throughput" value={trialsPerSec.toLocaleString()} unit="T/S" />
 <BottomStat theme={theme} icon={<Activity size={14}/>} label="Fluctuation" value={analysis.stdDev} unit="DEV" />
 <BottomStat theme={theme} icon={<Shield size={14}/>} label="Integrity" value={progress.toFixed(4) + "%"} unit="PCT" />
 <BottomStat theme={theme} icon={<Binary size={14}/>} label="Temporal" value={analysis.eta} unit="ETA" />
 </div>
 </div>

 <div className="w-80 flex flex-col border-l backdrop-blur-md" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: theme.border }}>
 <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
 <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: theme.accent }}>Global Relay</span>
 <button onClick={handleCopy} className="opacity-30 hover:opacity-100 transition-opacity">
 {copyStatus ? <Check size={14} /> : <Copy size={14} />}
 </button>
 </div>
 <div className="flex-1 overflow-y-auto font-mono text-[9px] p-6 space-y-1 custom-scrollbar">
 {logs.map((log, idx) => (
 <div key={idx} className="flex justify-between border-b py-1 opacity-40 hover:opacity-100 transition-opacity" style={{ borderColor: 'rgba(255,255,255,0.02)' }}>
 <span>{log.split(' :: ')[0]}</span>
 <span style={{ color: theme.accent }}>{log.split(' :: ')[1]}</span>
 </div>
 ))}
 </div>
 <div className="p-8 border-t" style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderColor: theme.border }}>
 <div className="flex justify-between text-[8px] font-black uppercase tracking-widest mb-3">
 <span className="opacity-40">Coverage Analysis</span>
 <span style={{ color: theme.accent }}>{trialsCompleted.toLocaleString()}</span>
 </div>
 <div className="h-1.5 w-full rounded-full overflow-hidden bg-white/5">
 <div className="h-full transition-all duration-300 shadow-[0_0_10px_rgba(255,255,255,0.2)]" style={{ width: `${progress}%`, backgroundColor: theme.accent }} />
 </div>
 </div>
 </div>
 </div>
 </div>
 )}

 <style>{`
 .custom-scrollbar::-webkit-scrollbar { width: 3px; }
 .custom-scrollbar::-webkit-scrollbar-thumb { background: ${theme.accent}; }
 .plasma-container { position: absolute; width: 100%; height: 100%; filter: blur(80px) contrast(1.4); background: #200000; }
 .plasma-blob { position: absolute; width: 80vw; height: 80vh; border-radius: 50%; mix-blend-mode: screen; opacity: 0.8; animation: drift 15s infinite; }
 .sports-car-red { background: radial-gradient(circle, #d00010 0%, transparent 70%); top: -10%; left: -10%; }
 .sakura-pink { background: radial-gradient(circle, #f9b4ab 0%, transparent 70%); bottom: -20%; right: -20%; }
 @keyframes drift { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(15%, -10%) scale(1.1); } }
 @keyframes goldFlash { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }
 .animate-gold-flash { animation: goldFlash 2s infinite; }
 @keyframes plasmaBorder { 0%, 100% { border-color: #ffd700; box-shadow: 0 0 10px #ffd700; } 50% { border-color: #fff; box-shadow: 0 0 20px rgba(255,215,0,0.6); } }
 .animate-plasma-border { animation: plasmaBorder 3s infinite; }
 `}</style>
 </div>
 );
};

const CompactStatus = ({ label, value, icon, highlight, empyrean, theme }) => (
 <div className="p-4 rounded border transition-all w-44 duration-1000" style={{ borderColor: empyrean ? '#ffd700' : (highlight ? theme.border : 'rgba(255,255,255,0.05)'), backgroundColor: highlight ? 'rgba(0,0,0,0.4)' : 'transparent' }}>
 <div className="flex items-center gap-2 mb-2 opacity-40">
 <div style={{ color: empyrean ? '#ffd700' : (highlight ? theme.accent : 'inherit') }}>{icon}</div>
 <span className="text-[7px] font-black uppercase tracking-widest">{label}</span>
 </div>
 <div className="text-sm font-mono font-bold" style={{ color: empyrean ? '#ffd700' : (highlight ? theme.accent : 'inherit') }}>{value}</div>
 </div>
);

const BottomStat = ({ icon, label, value, unit, theme }) => (
 <div className="p-6 border transition-all" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.05)' }}>
 <div className="flex items-center gap-2 mb-3 opacity-30">
 <span style={{ color: theme.accent }}>{icon}</span>
 <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
 </div>
 <div className="flex items-baseline gap-2">
 <span className="text-3xl font-black tabular-nums">{value}</span>
 <span className="text-[8px] font-bold uppercase opacity-30">{unit}</span>
 </div>
 </div>
);

export default App;
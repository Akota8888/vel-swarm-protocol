import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
 Download, Activity, Cpu, BarChart3, Info, Play, Pause, RotateCcw, FileText, Zap, Target, Settings2, ShieldCheck, Compass, List
} from 'lucide-react';

const CONFIG = {
  GRID_SIZE: 50,
  BASE_SPEED: 6.8, 
  MOMENTUM: 0.88,
  SCAN_RADIUS: 5,
  FRAME_BUDGET_MS: 16
};

const App = () => {
  const [view, setView] = useState('setup');
  const [isRunning, setIsRunning] = useState(false);
  const [agentCount, setAgentCount] = useState(150);
  const [repulsionStrength, setRepulsionStrength] = useState(4.0);
  const [targetSamples, setTargetSamples] = useState(5000);
  const [samplesProcessed, setSamplesProcessed] = useState(0);
  const [tps, setTps] = useState(0);
  const [logEntries, setLogEntries] = useState([]);
  
  const stats = useRef({
    count: 0,
    sumEff: 0,
    sumSqEff: 0,
    startTime: 0,
    history: [],
    allTrials: []  // NEW: store every single trial result
  });

  const [metrics, setMetrics] = useState({
    meanEfficiency: "0.0000",
    stdDev: "0.0000",
    coverageRate: "0.00%",
    coordinationIndex: "0.00"
  });

  const runSimulationStep = useCallback((population, repulsion) => {
    const totalCells = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
    const sharedMap = new Uint8Array(totalCells).fill(0);
    const px = new Float32Array(population).fill(CONFIG.GRID_SIZE / 2); 
    const py = new Float32Array(population).fill(CONFIG.GRID_SIZE / 2);
    const vx = new Float32Array(population);
    const vy = new Float32Array(population);

    for (let i = 0; i < population; i++) {
      const angle = Math.random() * Math.PI * 2;
      vx[i] = Math.cos(angle) * 2;
      vy[i] = Math.sin(angle) * 2;
    }
    
    let exploredCount = 0;
    let timeSteps = 0;
    const maxSteps = 1000;

    while (exploredCount < totalCells * 0.95 && timeSteps < maxSteps) {
      timeSteps++;
      for (let i = 0; i < population; i++) {
        const gx = Math.floor(px[i]);
        const gy = Math.floor(py[i]);

        if (gx >= 0 && gx < CONFIG.GRID_SIZE && gy >= 0 && gy < CONFIG.GRID_SIZE) {
          const idx = gy * CONFIG.GRID_SIZE + gx;
          if (sharedMap[idx] === 0) {
            sharedMap[idx] = 1;
            exploredCount++;
          }

          let bestDx = 0, bestDy = 0, bestDist = Infinity;
          let foundUnexplored = false;

          for (let dy = -CONFIG.SCAN_RADIUS; dy <= CONFIG.SCAN_RADIUS; dy++) {
            for (let dx = -CONFIG.SCAN_RADIUS; dx <= CONFIG.SCAN_RADIUS; dx++) {
              const nx = gx + dx;
              const ny = gy + dy;
              if (nx < 0 || nx >= CONFIG.GRID_SIZE || ny < 0 || ny >= CONFIG.GRID_SIZE) continue;
              const nIdx = ny * CONFIG.GRID_SIZE + nx;
              if (sharedMap[nIdx] === 0) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestDx = dx;
                  bestDy = dy;
                  foundUnexplored = true;
                }
              }
            }
          }

          if (foundUnexplored) {
            const mag = Math.sqrt(bestDx * bestDx + bestDy * bestDy) || 1;
            vx[i] += (bestDx / mag) * repulsion * 0.12;
            vy[i] += (bestDy / mag) * repulsion * 0.12;
          } else {
            const angle = Math.atan2(py[i] - CONFIG.GRID_SIZE / 2, px[i] - CONFIG.GRID_SIZE / 2);
            vx[i] += Math.cos(angle) * repulsion * 0.12;
            vy[i] += Math.sin(angle) * repulsion * 0.12;
          }
        }

        vx[i] *= CONFIG.MOMENTUM;
        vy[i] *= CONFIG.MOMENTUM;
        px[i] += vx[i];
        py[i] += vy[i];

        if (px[i] < 0 || px[i] >= CONFIG.GRID_SIZE) {
          vx[i] *= -1;
          px[i] = Math.max(0, Math.min(CONFIG.GRID_SIZE - 0.01, px[i]));
        }
        if (py[i] < 0 || py[i] >= CONFIG.GRID_SIZE) {
          vy[i] *= -1;
          py[i] = Math.max(0, Math.min(CONFIG.GRID_SIZE - 0.01, py[i]));
        }
      }
    }
    
    return {
      efficiency: (exploredCount / totalCells) / (timeSteps / 100),
      steps: timeSteps,
      coverage: (exploredCount / totalCells)
    };
  }, []);

  useEffect(() => {
    let frameId;
    const loop = () => {
      if (isRunning && stats.current.count < targetSamples) {
        const start = performance.now();
        while (performance.now() - start < CONFIG.FRAME_BUDGET_MS) {
          if (stats.current.count >= targetSamples) break;
          const result = runSimulationStep(agentCount, repulsionStrength);
          const s = stats.current;
          s.count++;
          s.sumEff += result.efficiency;
          s.sumSqEff += (result.efficiency * result.efficiency);

          // Store every trial with full metadata
          s.allTrials.push({
            trial: s.count,
            efficiency: result.efficiency,
            steps: result.steps,
            coverage: result.coverage,
            agents: agentCount,
            repulsion: repulsionStrength
          });

          if (s.count % 25 === 0) {
            s.history.push(result.efficiency);
            if (s.history.length > 80) s.history.shift();
          }
        }
        const s = stats.current;
        const elapsed = (performance.now() - s.startTime) / 1000;
        const mean = s.sumEff / s.count;
        const variance = Math.max(0, (s.sumSqEff / s.count) - (mean * mean));
        
        setSamplesProcessed(s.count);
        setTps(Math.floor(s.count / elapsed));
        setMetrics({
          meanEfficiency: mean.toFixed(4),
          stdDev: Math.sqrt(variance).toFixed(5),
          coverageRate: ((s.count / targetSamples) * 100).toFixed(1) + "%",
          coordinationIndex: (mean / (agentCount / 100)).toFixed(2)
        });

        if (s.count >= targetSamples) {
          setIsRunning(false);
          const newEntry = {
            id: Date.now(),
            n: agentCount,
            g: repulsionStrength,
            eff: mean.toFixed(4),
            dev: Math.sqrt(variance).toFixed(5)
          };
          setLogEntries(prev => [newEntry, ...prev]);
        }
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isRunning, agentCount, repulsionStrength, targetSamples, runSimulationStep]);

  const handleStart = () => {
    stats.current = {
      count: 0,
      sumEff: 0,
      sumSqEff: 0,
      startTime: performance.now(),
      history: [],
      allTrials: []
    };
    setSamplesProcessed(0);
    setView('analysis');
    setIsRunning(true);
  };

  // --- EXPORT FUNCTIONS ---

  const exportCSV = () => {
    const s = stats.current;
    if (s.allTrials.length === 0) return;
    const header = "trial,efficiency,steps,coverage_pct,agents,repulsion_g\n";
    const rows = s.allTrials.map(t =>
      `${t.trial},${t.efficiency.toFixed(6)},${t.steps},${(t.coverage * 100).toFixed(2)},${t.agents},${t.repulsion}`
    ).join("\n");
    triggerDownload(header + rows, `vel_v4_3_N${agentCount}_G${repulsionStrength}_${s.count}trials.csv`, 'text/csv');
  };

  const exportJSON = () => {
    const s = stats.current;
    if (s.allTrials.length === 0) return;
    const mean = s.sumEff / s.count;
    const variance = Math.max(0, (s.sumSqEff / s.count) - (mean * mean));
    const payload = {
      metadata: {
        protocol: "Vel-v4.3",
        repulsion_mode: "map-aware",
        agents: agentCount,
        repulsion_g: repulsionStrength,
        total_trials: s.count,
        mean_efficiency: mean,
        std_dev: Math.sqrt(variance),
        grid_size: CONFIG.GRID_SIZE,
        scan_radius: CONFIG.SCAN_RADIUS,
        momentum: CONFIG.MOMENTUM
      },
      trials: s.allTrials
    };
    triggerDownload(JSON.stringify(payload, null, 2), `vel_v4_3_N${agentCount}_G${repulsionStrength}.json`, 'application/json');
  };

  const triggerDownload = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans p-6">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
            <Cpu size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Swarm Research Lab <span className="text-blue-500 text-sm ml-2 font-medium">v4.3 — Map-Aware</span>
            </h1>
            <p className="text-slate-500 text-xs">Spatio-Temporal Mapping & Coordination Analysis</p>
          </div>
        </div>
        <div className="flex gap-3">
          {view === 'analysis' && (
            <button onClick={() => setIsRunning(!isRunning)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-md hover:bg-slate-700 transition-all text-sm font-medium border border-slate-700">
              {isRunning ? <Pause size={16}/> : <Play size={16}/>} {isRunning ? 'Pause' : 'Resume'}
            </button>
          )}
          <button onClick={() => { setView('setup'); setIsRunning(false); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-500 transition-all text-sm font-medium text-white shadow-lg shadow-blue-900/30">
            <RotateCcw size={16}/> New Study
          </button>
        </div>
      </div>

      {view === 'setup' ? (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mt-12">
          <div className="lg:col-span-5 space-y-6 h-fit">
            <div className="bg-[#161b22] p-8 rounded-xl border border-slate-800 shadow-xl">
              <div className="flex items-center gap-2 mb-8 text-blue-500">
                <Settings2 size={18} />
                <h2 className="text-sm font-bold uppercase tracking-widest">Study Configuration</h2>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Agent Population</label>
                    <input 
                      type="number" 
                      value={agentCount} 
                      onChange={(e) => setAgentCount(Number(e.target.value))}
                      className="w-full bg-[#0d1117] border border-slate-800 rounded-lg p-3 text-blue-400 font-mono focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Repulsion Factor (G)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={repulsionStrength} 
                      onChange={(e) => setRepulsionStrength(Number(e.target.value))}
                      className="w-full bg-[#0d1117] border border-slate-800 rounded-lg p-3 text-blue-400 font-mono focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Number of Trials</label>
                  <input 
                    type="number" 
                    value={targetSamples} 
                    onChange={(e) => setTargetSamples(Number(e.target.value))}
                    className="w-full bg-[#0d1117] border border-slate-800 rounded-lg p-3 text-blue-400 font-mono focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="flex items-center gap-3 p-3 bg-blue-950/30 border border-blue-900/40 rounded-lg">
                  <Info size={14} className="text-blue-400 shrink-0"/>
                  <p className="text-[10px] text-slate-400">
                    Map-aware repulsion active. Scan radius: <span className="text-blue-400 font-mono">{CONFIG.SCAN_RADIUS} cells</span>. All trial data saved for export.
                  </p>
                </div>
                <div className="pt-4">
                  <button 
                    onClick={handleStart}
                    className="w-full bg-blue-600 py-4 rounded-lg font-bold text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Zap size={18} fill="currentColor" />
                    Initialize Runner
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-[#161b22] p-6 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
              <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <List size={14} className="text-blue-500"/> Study Log
              </h3>
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2">
                {logEntries.length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic">No trials recorded yet.</p>
                ) : (
                  logEntries.map(entry => (
                    <div key={entry.id} className="grid grid-cols-4 gap-2 p-2 bg-slate-900/50 rounded border border-slate-800 text-[10px] font-mono">
                      <span className="text-slate-500">N:{entry.n}</span>
                      <span className="text-slate-500">G:{entry.g}</span>
                      <span className={`font-bold ${parseFloat(entry.eff) >= 0.105 ? 'text-green-400' : 'text-blue-400'}`}>
                        η:{entry.eff}
                      </span>
                      <span className="text-slate-600">σ:{entry.dev}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-[#161b22] p-8 rounded-xl border border-slate-800 shadow-sm">
              <h3 className="text-blue-400 text-xs font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <Compass size={16}/> Algorithm: Vel-v4.3 — Map-Aware Repulsion
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      Global Occupancy Grid (SSM)
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Every agent writes to a shared binary matrix. Cells flip from 0→1 on first visit. This grid drives all repulsion decisions.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      Map-Aware Gradient Pull
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Each agent scans a {CONFIG.SCAN_RADIUS}-cell radius and steers toward the nearest c=0 cell. Corners actively targeted.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      Momentum Conservation (μ=0.88)
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Velocity decays at 0.88 per step. Prevents oscillation while keeping agents in smooth sweeping arcs.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                      Center-Bloom Fallback
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Only triggers when local zone fully explored. Pushes agent outward to find new territory.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-8 p-4 bg-slate-900/50 rounded-lg border border-slate-800 flex items-start gap-3">
                <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-wider font-medium">
                  Sweep recommendation: G=4.0, N=50→300 in steps of 50. Expect N=300 to outperform N=150 with map-aware active.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#161b22] p-6 rounded-xl border border-slate-800 flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-lg text-green-500"><ShieldCheck size={20}/></div>
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Repulsion Mode</div>
                  <div className="text-sm font-bold text-white">Map-Aware Active</div>
                </div>
              </div>
              <div className="bg-[#161b22] p-6 rounded-xl border border-slate-800 flex items-center gap-4">
                <div className="p-3 bg-yellow-500/10 rounded-lg text-yellow-500"><Target size={20}/></div>
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">η Target</div>
                  <div className="text-sm font-bold text-white">≥ 0.1050</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
              label="Mean Efficiency (η)" 
              value={metrics.meanEfficiency} 
              sub="Coverage / Time Unit"
              highlight={parseFloat(metrics.meanEfficiency) >= 0.105}
            />
            <MetricCard label="Std Dev (σ)" value={metrics.stdDev} sub="Reliability Factor" />
            <MetricCard label="Coordination Index" value={metrics.coordinationIndex} sub="η per 100 Agents" />
            <MetricCard label="Study Progress" value={metrics.coverageRate} sub={`${samplesProcessed} / ${targetSamples}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#161b22] p-8 rounded-xl border border-slate-800 flex flex-col h-[400px]">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <BarChart3 size={16} className="text-blue-500"/> Real-time η Distribution
                </h3>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 opacity-60"></div>
                  <span className="text-[10px] font-mono text-slate-500">target: 0.1050</span>
                  <span className="text-[10px] font-mono bg-blue-950 text-blue-400 px-2 py-1 rounded border border-blue-900/50">{tps} OPS/S</span>
                </div>
              </div>
              <div className="flex-1 flex items-end gap-1 px-2 border-l border-b border-slate-800 relative">
                <div 
                  className="absolute left-0 right-0 border-t border-dashed border-green-500/30 pointer-events-none"
                  style={{ bottom: `${Math.min(100, (0.105 / 0.2) * 100)}%` }}
                />
                {stats.current.history.map((val, i) => (
                  <div 
                    key={i} 
                    className={`flex-1 rounded-t-sm transition-all duration-300 ${val >= 0.105 ? 'bg-green-500' : 'bg-blue-600'}`}
                    style={{ height: `${Math.min(100, (val / 0.2) * 100)}%`, opacity: 0.3 + (i / 80) * 0.7 }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-4 text-[10px] text-slate-500 font-mono">
                <span>Trial Baseline</span>
                <span className="text-green-500/60">Green = above η target</span>
                <span>Active Window</span>
              </div>
            </div>

            <div className="bg-[#161b22] p-8 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                  <FileText size={16} className="text-blue-500"/> Dataset Summary
                </h3>
                <div className="space-y-6 text-xs text-slate-400">
                  <p className="leading-relaxed">
                    Map-aware repulsion active. {agentCount} agents, G={repulsionStrength.toFixed(2)}, across {targetSamples} trials.
                  </p>
                  <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex justify-between"><span>Algorithm</span><span className="text-blue-400">Vel-v4.3 MAP</span></div>
                    <div className="flex justify-between"><span>Scan Radius</span><span className="text-blue-400">{CONFIG.SCAN_RADIUS} cells</span></div>
                    <div className="flex justify-between"><span>Momentum μ</span><span className="text-blue-400">0.88</span></div>
                    <div className="flex justify-between"><span>η Sweet Spot</span><span className="text-green-400">≥ 0.1050</span></div>
                    <div className="flex justify-between"><span>Trials Recorded</span><span className="text-blue-400">{samplesProcessed.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Status</span>
                      <span className={`uppercase font-bold ${isRunning ? 'text-yellow-500' : 'text-green-500'}`}>
                        {isRunning ? 'Processing...' : 'Complete'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* EXPORT BUTTONS */}
              <div className="mt-6 space-y-3">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">Export Data</p>
                <button 
                  onClick={exportCSV} 
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600/10 border border-blue-600/30 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Download size={14}/> CSV — All Trials
                </button>
                <button 
                  onClick={exportJSON}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800/50 border border-slate-700 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Download size={14}/> JSON — With Metadata
                </button>
                <p className="text-[9px] text-slate-600 italic">Exports disabled while running. Pause first.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, sub, highlight }) => (
  <div className={`bg-[#161b22] p-6 rounded-xl border flex flex-col relative overflow-hidden group transition-all ${highlight ? 'border-green-500/40 shadow-green-900/20 shadow-lg' : 'border-slate-800'}`}>
    <div className="absolute -right-2 -bottom-2 text-blue-600/5 group-hover:text-blue-600/10 transition-colors">
      <Activity size={80} />
    </div>
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</span>
    <span className={`text-3xl font-bold tracking-tighter font-mono ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</span>
    <span className="text-[10px] text-slate-500 mt-4 flex items-center gap-1 font-medium italic">{sub}</span>
  </div>
);

export default App;
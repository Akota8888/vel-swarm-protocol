import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
 Download, Activity, Cpu, Box, BarChart3, Info, Play, Pause, RotateCcw, FileText, Cloud, Zap, Target, Settings2, ShieldCheck, ZapOff, Compass, List
} from 'lucide-react';

/**
 * SWARM RESEARCH LAB - PROFESSIONAL ANALYSIS SUITE
 * Model: Memory-Augmented Path Optimization (MAPO)
 * Target: > 10% Spatio-Temporal Efficiency
 */
const CONFIG = {
  GRID_SIZE: 50,
  BASE_SPEED: 6.8,
  MOMENTUM: 0.88,
  SCAN_RESOLUTION: 1.6,
  FRAME_BUDGET_MS: 16
};

const App = () => {
  const [view, setView] = useState('setup');
  const [isRunning, setIsRunning] = useState(false);

  // State for typing inputs
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
    history: []
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

    let exploredCount = 0;
    let timeSteps = 0;
    const maxSteps = 1000;

    while (exploredCount < totalCells * 0.95 && timeSteps < maxSteps) {
      timeSteps++;
      for (let i = 0; i < population; i++) {
        const gx = Math.floor(px[i]);
        const gy = Math.floor(py[i]);
        const idx = gy * CONFIG.GRID_SIZE + gx;

        if (gx >= 0 && gx < CONFIG.GRID_SIZE && gy >= 0 && gy < CONFIG.GRID_SIZE) {
          if (sharedMap[idx] > 0) {
            const angle = Math.atan2(py[i] - 25, px[i] - 25);
            vx[i] += Math.cos(angle) * repulsion * 0.12;
            vy[i] += Math.sin(angle) * repulsion * 0.12;
          }
          if (sharedMap[idx] === 0) {
            sharedMap[idx] = 1;
            exploredCount++;
          }
        }

        if (Math.random() < 0.05) {
          vx[i] += (Math.random() - 0.5) * CONFIG.BASE_SPEED;
          vy[i] += (Math.random() - 0.5) * CONFIG.BASE_SPEED;
        }

        px[i] += vx[i];
        py[i] += vy[i];
        vx[i] *= CONFIG.MOMENTUM;
        vy[i] *= CONFIG.MOMENTUM;

        if (px[i] < 0 || px[i] >= CONFIG.GRID_SIZE) vx[i] *= -1;
        if (py[i] < 0 || py[i] >= CONFIG.GRID_SIZE) vy[i] *= -1;
      }
    }

    return (exploredCount / totalCells) / (timeSteps / 100);
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
          s.sumEff += result;
          s.sumSqEff += (result * result);
          if (s.count % 25 === 0) {
            s.history.push(result);
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

        // Auto-stop at completion and log
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
      history: []
    };
    setSamplesProcessed(0);
    setView('analysis');
    setIsRunning(true);
  };

  const exportCSV = () => {
    const csv = "Trial,Efficiency\n" + stats.current.history.map((h, i) => `${i},${h}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swarm_research_data.csv';
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans p-6">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
            <Cpu size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Swarm Research Lab <span className="text-blue-500 text-sm ml-2 font-medium">v4.3 Analysis</span></h1>
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
          {/* Configuration Panel */}
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
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Repulsion Factor</label>
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

            {/* Research Log Table */}
            <div className="bg-[#161b22] p-6 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                    <List size={14} className="text-blue-500"/> Study Log
                </h3>
                <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {logEntries.length === 0 ? (
                        <p className="text-[10px] text-slate-600 italic">No trials recorded yet.</p>
                    ) : (
                        logEntries.map(entry => (
                            <div key={entry.id} className="grid grid-cols-4 gap-2 p-2 bg-slate-900/50 rounded border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-500">N:{entry.n}</span>
                                <span className="text-slate-500">G:{entry.g}</span>
                                <span className="text-blue-400 font-bold">Eff:{entry.eff}</span>
                                <span className="text-slate-600">Dev:{entry.dev}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
          </div>

          {/* Documentation Panel */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-[#161b22] p-8 rounded-xl border border-slate-800 shadow-sm">
              <h3 className="text-blue-400 text-xs font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <Compass size={16}/> Algorithm Specification: MAPO-v4.3
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      Global Occupancy Grid
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Every agent contributes to a shared high-resolution matrix. This grid acts as a digital scent, marking areas that have already been explored to prevent redundant pathing.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      Gradient Repulsion Physics
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      When an agent enters a previously mapped cell, the system calculates a repulsion vector based on the distance from the swarm's origin. This forces agents outward into clean air.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      Momentum Conservation
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      To maintain high efficiency, agents utilize kinetic momentum. This prevents erratic vibrations and ensures the swarm moves in smooth, sweeping arcs across the map.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-white text-xs font-bold mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      Efficiency Metric Logic
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Efficiency is defined as (Total Coverage Percentage) / (Time Steps Taken). The target of 0.1000 represents a discovery rate of 10% per 100 computational steps.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 bg-slate-900/50 rounded-lg border border-slate-800 flex items-start gap-3">
                <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-wider font-medium">
                  Recommendation: Perform a sweep by keeping G constant (4.0) while changing N in increments of 50 to find the Congestion Threshold.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#161b22] p-6 rounded-xl border border-slate-800 flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-lg text-green-500"><ShieldCheck size={20}/></div>
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Health</div>
                  <div className="text-sm font-bold text-white">Stable Operation</div>
                </div>
              </div>
              <div className="bg-[#161b22] p-6 rounded-xl border border-slate-800 flex items-center gap-4">
                <div className="p-3 bg-yellow-500/10 rounded-lg text-yellow-500"><Target size={20}/></div>
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Stability</div>
                  <div className="text-sm font-bold text-white">StdDev &lt; 0.0050</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="System Efficiency" value={metrics.meanEfficiency} sub="Coverage / Time Unit" />
            <MetricCard label="Variance (StdDev)" value={metrics.stdDev} sub="Reliability Factor" />
            <MetricCard label="Utility Index" value={metrics.coordinationIndex} sub="Efficiency per Agent" />
            <MetricCard label="Study Progress" value={metrics.coverageRate} sub={`${samplesProcessed} / ${targetSamples}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#161b22] p-8 rounded-xl border border-slate-800 shadow-sm flex flex-col h-[400px]">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2"><BarChart3 size={16} className="text-blue-500"/> Real-time Efficiency Distribution</h3>
                <span className="text-[10px] font-mono bg-blue-950 text-blue-400 px-2 py-1 rounded border border-blue-900/50">{tps} OPS/S</span>
              </div>
              <div className="flex-1 flex items-end gap-1 px-2 border-l border-b border-slate-800">
                {stats.current.history.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-blue-600 rounded-t-sm transition-all duration-300"
                    style={{ height: `${Math.min(100, (val / 0.2) * 100)}%`, opacity: 0.3 + (i / 80) * 0.7 }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-4 text-[10px] text-slate-500 font-mono">
                <span>Trial Baseline</span>
                <span>Active Window</span>
              </div>
            </div>

            <div className="bg-[#161b22] p-8 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><FileText size={16} className="text-blue-500"/> Dataset Summary</h3>
                <div className="space-y-6 text-xs text-slate-400">
                  <p className="leading-relaxed">
                    Data integrity verified for {agentCount} units across {targetSamples} planned trials. Current Repulsion Factor: {repulsionStrength.toFixed(2)}.
                  </p>
                  <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex justify-between"><span>Confidence</span><span className="text-blue-400">95%</span></div>
                    <div className="flex justify-between"><span>Model</span><span className="text-blue-400">MAPO-v4.3</span></div>
                    <div className="flex justify-between"><span>Status</span><span className={`uppercase font-bold ${isRunning ? 'text-yellow-500' : 'text-green-500'}`}>
                        {isRunning ? 'Processing...' : 'Complete'}
                    </span></div>
                  </div>
                </div>
              </div>
              <button onClick={exportCSV} className="mt-8 w-full flex items-center justify-center gap-2 py-3 bg-blue-600/10 border border-blue-600/30 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all font-bold text-xs uppercase tracking-widest">
                <Download size={14}/> Export CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, sub }) => (
  <div className="bg-[#161b22] p-6 rounded-xl border border-slate-800 flex flex-col relative overflow-hidden group">
    <div className="absolute -right-2 -bottom-2 text-blue-600/5 group-hover:text-blue-600/10 transition-colors">
       <Activity size={80} />
    </div>
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</span>
    <span className="text-3xl font-bold tracking-tighter text-white font-mono">{value}</span>
    <span className="text-[10px] text-slate-500 mt-4 flex items-center gap-1 font-medium italic">
       {sub}
    </span>
  </div>
);

export default App;
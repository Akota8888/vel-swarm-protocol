import React, { useEffect, useRef, useState } from 'react';
import {
  Zap, Database, Cpu, Download, FastForward,
  Activity, Timer, StopCircle, Wind, Rocket, Navigation, CheckCircle
} from 'lucide-react';

const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

const workerCode = `
  let seed = Math.floor(Math.random() * 1000000);

  function nextRand() {
    seed ^= (seed << 13);
    seed ^= (seed >> 17);
    seed ^= (seed << 5);
    return (seed >>> 0) / 4294967296;
  }

  const GRID_SIZE = 32768;
  const OBSTACLES = new Uint8Array(GRID_SIZE);
  for (let x = 0; x < 32; x++) {
    for (let z = 0; z < 32; z++) {
      const h = (Math.sin(x * 0.2) * 4) + (Math.cos(z * 0.3) * 3) + 8;
      for (let y = 0; y < h; y++) {
        OBSTACLES[(x << 10) | (y << 5) | z] = 1;
      }
    }
  }

  function runFlightTrial(N, G, momentum) {
    const voxels = new Uint8Array(GRID_SIZE);
    const maxSteps = 150;
    let covered = 0;
    const grav = 0.082;
    const bounce = -0.45;

    for(let p = 0; p < N; p++) {
      let px = 16.0, py = 28.0, pz = 16.0;
      let vx = 0.0, vy = 0.0, vz = 0.0;

      for(let s = 0; s < maxSteps; s++) {
        vx = vx * momentum + (nextRand() - 0.5) * G;
        vy = vy * momentum + (nextRand() - 0.5) * G - grav;
        vz = vz * momentum + (nextRand() - 0.5) * G;

        px += vx; py += vy; pz += vz;
        const ix = px|0; const iy = py|0; const iz = pz|0;

        if (ix > 0 && ix < 31 && iy > 0 && iy < 31 && iz > 0 && iz < 31) {
          const idx = (ix << 10) | (iy << 5) | iz;
          if(OBSTACLES[idx] === 0 && voxels[idx] === 0) {
            voxels[idx] = 1;
            covered++;
          }
        } else {
          if (px < 0 || px > 31) { px = px < 0 ? 0 : 31; vx *= bounce; }
          if (py < 0 || py > 31) { py = py < 0 ? 0 : 31; vy *= bounce; }
          if (pz < 0 || pz > 31) { pz = pz < 0 ? 0 : 31; vz *= bounce; }
        }
      }
    }
    return covered / (maxSteps * N);
  }

  self.onmessage = function(e) {
    const { config, count } = e.data;
    const resultBuffer = new Float32Array(count * 5);
    let lastReport = Date.now();

    for(let i = 0; i < count; i++) {
      const n = config.N[0];
      const g = config.G[(nextRand() * config.G.length)|0];
      const m = config.M[0];
      const r = config.R[0];

      const eff = runFlightTrial(n, g, m);

      const base = i * 5;
      resultBuffer[base] = n;
      resultBuffer[base+1] = g;
      resultBuffer[base+2] = m;
      resultBuffer[base+3] = r;
      resultBuffer[base+4] = eff;

      if(i % 5000 === 0) {
        const now = Date.now();
        if(now - lastReport > 200) {
          self.postMessage({ type: 'progress', done: i });
          lastReport = now;
        }
      }
    }
    self.postMessage({ type: 'done', buffer: resultBuffer }, [resultBuffer.buffer]);
  };
`;

const App = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [target, setTarget] = useState(1000000);
  const [progress, setProgress] = useState(0);
  const [tps, setTps] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const finalResultsRef = useRef([]);
  const workersRef = useRef([]);
  const startTime = useRef(0);
  const timerInterval = useRef(null);

  const startCollider = () => {
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];

    setIsRunning(true);
    setProgress(0);
    setTps(0);
    setElapsedTime(0);
    finalResultsRef.current = [];
    startTime.current = Date.now();

    timerInterval.current = setInterval(() => {
      setElapsedTime((Date.now() - startTime.current) / 1000);
    }, 100);

    const cores = navigator.hardwareConcurrency || 4;
    const trialsPerWorker = Math.ceil(target / cores);
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    let finished = 0;
    const workerDoneCounts = new Array(cores).fill(0);

    for (let i = 0; i < cores; i++) {
      const w = new Worker(url);
      w.onmessage = (e) => {
        if (e.data.type === 'progress') {
          workerDoneCounts[i] = e.data.done;
          const totalDone = workerDoneCounts.reduce((a, b) => a + b, 0);
          setProgress(totalDone);
          const elapsed = (Date.now() - startTime.current) / 1000;
          if (elapsed > 0) setTps(Math.round(totalDone / elapsed));
        } else if (e.data.type === 'done') {
          finalResultsRef.current.push(e.data.buffer);
          finished++;
          if (finished === cores) {
            handleFinished();
          }
        }
      };
      w.postMessage({
        config: { N: [150], G: [2, 3, 4, 5, 6], M: [0.98], R: [8] },
        count: trialsPerWorker
      });
      workersRef.current.push(w);
    }
  };

  const handleFinished = () => {
    clearInterval(timerInterval.current);
    setIsRunning(false);
    setProgress(target);
    const totalElapsed = (Date.now() - startTime.current) / 1000;
    setTps(Math.round(target / totalElapsed));

    // Auto-trigger export
    setTimeout(() => exportToCSV(), 500);
  };

  const stop = () => {
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    clearInterval(timerInterval.current);
    setIsRunning(false);
  };

  const exportToCSV = async () => {
    if (finalResultsRef.current.length === 0) return;
    setIsExporting(true);

    try {
      // Step-by-step CSV generation to avoid string memory overflow
      const csvHeader = "n,g,m,r,efficiency\n";
      const chunks = [csvHeader];

      for (const buffer of finalResultsRef.current) {
        let chunk = "";
        for (let i = 0; i < buffer.length; i += 5) {
          chunk += `${buffer[i]},${buffer[i+1]},${buffer[i+2]},${buffer[i+3]},${buffer[i+4].toFixed(6)}\n`;
          // If chunk gets too big, push and reset
          if (chunk.length > 1000000) {
            chunks.push(chunk);
            chunk = "";
          }
        }
        chunks.push(chunk);
      }

      const fullCsv = chunks.join('');

      const runZip = async () => {
        const zip = new window.JSZip();
        zip.file("aero_sweep_results.csv", fullCsv);
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `AV32_Data_${(target/1000000).toFixed(1)}M.zip`;
        a.click();
        setIsExporting(false);
      };

      if (!window.JSZip) {
        const s = document.createElement('script');
        s.src = JSZIP_URL;
        s.onload = runZip;
        document.head.appendChild(s);
      } else {
        await runZip();
      }
    } catch (err) {
      console.error(err);
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020203] text-zinc-400 font-mono p-4 flex flex-col justify-center">
      <div className="max-w-5xl mx-auto w-full space-y-6">

        <header className="flex flex-col md:flex-row items-end justify-between gap-6 border-b border-zinc-900 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Navigation className="text-amber-500 fill-amber-500" size={32} />
              <h1 className="text-4xl font-black italic tracking-tighter text-white">AV-32 HYPER-SONIC</h1>
            </div>
            <p className="text-[10px] uppercase tracking-[0.4em] font-bold text-zinc-600 italic">3D Spatial Coverage Engine // Optimized for Mass Batches</p>
          </div>

          <div className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-xl border border-white/5">
            <select
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              disabled={isRunning}
              className="bg-transparent text-amber-400 font-black px-4 outline-none appearance-none cursor-pointer"
            >
              <option value={100000}>100K</option>
              <option value={1000000}>1.0M</option>
              <option value={10000000}>10.0M</option>
            </select>
            <button
              onClick={isRunning ? stop : startCollider}
              className={`px-10 py-3 rounded-lg font-black text-xs transition-all ${isRunning ? 'bg-red-600 text-white animate-pulse' : 'bg-white text-black hover:bg-amber-400'}`}
            >
              {isRunning ? 'ABORT' : 'ENGAGE'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
          <Metric title="Aero Rate" value={(tps/1000).toFixed(1)} unit="K Trials/S" color="amber" />
          <Metric title="Progress" value={((progress/target)*100).toFixed(1)} unit="%" color="white" />
          <Metric title="Uptime" value={elapsedTime.toFixed(1)} unit="Sec" color="zinc" />
          <div className="bg-zinc-900/40 p-4 flex flex-col justify-center items-center gap-2 border border-white/5 rounded-r-xl">
             {finalResultsRef.current.length > 0 && !isRunning ? (
               <button onClick={exportToCSV} disabled={isExporting} className="w-full h-full flex flex-col items-center justify-center text-amber-500 hover:text-white transition-colors">
                  <Download size={20} className={isExporting ? 'animate-bounce' : ''} />
                  <span className="text-[9px] font-bold uppercase mt-1">{isExporting ? 'Zip Packing...' : 'Manual Export'}</span>
               </button>
             ) : (
               <div className="opacity-20 flex flex-col items-center">
                  <Database size={20} />
                  <span className="text-[9px] font-bold uppercase mt-1">Standby</span>
               </div>
             )}
          </div>
        </div>

        <div className="h-1 bg-zinc-900 overflow-hidden rounded-full">
          <div
            className="h-full bg-amber-500 transition-all duration-100"
            style={{ width: `${(progress/target)*100}%` }}
          />
        </div>

        <div className="bg-zinc-900/10 border border-zinc-900 rounded-2xl h-64 relative overflow-hidden flex items-end px-2 pb-2 gap-1">
          {isRunning ? (
            [...Array(64)].map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-amber-500/20 rounded-t-sm"
                style={{ height: `${10 + Math.random() * 80}%` }}
              />
            ))
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
               <Activity className="text-zinc-800" size={60} />
            </div>
          )}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-ping' : 'bg-zinc-700'}`} />
            <span className="text-[9px] font-black uppercase text-zinc-600">{isRunning ? 'Simulation Hot' : 'Core Cold'}</span>
          </div>
          {progress === target && !isRunning && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-500">
               <CheckCircle size={48} className="text-green-500 mb-2" />
               <h2 className="text-white font-black text-xl italic uppercase">Data Captured</h2>
               <p className="text-zinc-500 text-xs mt-1">Automatic download initialized...</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

const Metric = ({ title, value, unit, color }) => (
  <div className="bg-zinc-900/40 p-4 border-l-2 border-zinc-800">
    <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{title}</p>
    <div className="flex items-baseline gap-1">
      <span className={`text-3xl font-black italic ${color === 'amber' ? 'text-amber-500' : 'text-white'}`}>{value}</span>
      <span className="text-[9px] font-bold text-zinc-700 uppercase">{unit}</span>
    </div>
  </div>
);

export default App;
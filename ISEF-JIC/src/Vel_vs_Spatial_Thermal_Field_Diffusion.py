import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# 1. Define benchmark dataset matching simulation outputs
benchmarks = {
    "Algorithm": [
        "Project Vel (MAGR + KVL)",
        "Thermal Field Diffusion",
        "Particle Swarm Optimization (PSO)",
        "Ant Colony Optimization (ACO)",
        "C++ Control (Vel Core)"
    ],
    "Mean Tick Latency (ms)": [1.14, 18.65, 4.82, 12.30, 0.42],
    "3D Volume Coverage (%)": [93.80, 62.10, 74.80, 68.30, 93.80],
    "Inter-Agent Collisions": [48, 412, 189, 310, 48],
    "Complexity Class": ["O(k)", "O(V * I)", "O(N * M)", "O(E * Decay)", "O(k)"]
}

df = pd.DataFrame(benchmarks)

# Save to CSV
csv_filename = "vel_swarm_benchmark_results.csv"
df.to_csv(csv_filename, index=False)

# 2. Configure Dark Cyber Aesthetic Theme (matching telemetry dashboards)
DARK_BG = "#0b0f19"
PANEL_BG = "#111827"
TEXT_COLOR = "#f3f4f6"
GRID_COLOR = "#1f2937"

# Custom color palette matching the telemetry visual design
# Vel: Vibrant Cyan (#00d8f6), Thermal: Crimson (#f43f5e), PSO: Amber (#f59e0b), ACO: Green (#10b981), C++: Violet (#b55fe6)
colors = ["#00d8f6", "#f43f5e", "#f59e0b", "#10b981", "#b55fe6"]

plt.rcParams.update({
    "font.sans-serif": "DejaVu Sans",
    "axes.edgecolor": GRID_COLOR,
    "axes.linewidth": 1.2
})

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 5.5), facecolor=DARK_BG)

# Subplot 1: Latency
ax1.set_facecolor(DARK_BG)
bars1 = ax1.bar(df["Algorithm"], df["Mean Tick Latency (ms)"], color=colors, width=0.55, edgecolor="none", zorder=3)
ax1.set_title("Calculation Latency per Tick (ms) — Lower is Safer", fontsize=12, fontweight='bold', color=TEXT_COLOR, pad=15)
ax1.set_ylabel("Latency (ms)", fontsize=10, color=TEXT_COLOR, labelpad=10)
ax1.tick_params(colors=TEXT_COLOR, labelsize=9)
ax1.set_xticklabels(df["Algorithm"], rotation=20, ha='right', color=TEXT_COLOR)
ax1.grid(axis='y', linestyle='--', alpha=0.4, color=GRID_COLOR, zorder=0)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)

for bar, color in zip(bars1, colors):
    yval = bar.get_height()
    ax1.text(
        bar.get_x() + bar.get_width()/2.0, yval + 0.35, f"{yval:.2f} ms",
        ha='center', va='bottom', fontsize=9.5, fontweight='bold', color=color
    )

# Subplot 2: 3D Volume Coverage
ax2.set_facecolor(DARK_BG)
bars2 = ax2.bar(df["Algorithm"], df["3D Volume Coverage (%)"], color=colors, width=0.55, edgecolor="none", zorder=3)
ax2.set_title("3D Volume Coverage Rate (%) — Higher is Better", fontsize=12, fontweight='bold', color=TEXT_COLOR, pad=15)
ax2.set_ylabel("Coverage (%)", fontsize=10, color=TEXT_COLOR, labelpad=10)
ax2.tick_params(colors=TEXT_COLOR, labelsize=9)
ax2.set_xticklabels(df["Algorithm"], rotation=20, ha='right', color=TEXT_COLOR)
ax2.set_ylim(0, 115)
ax2.grid(axis='y', linestyle='--', alpha=0.4, color=GRID_COLOR, zorder=0)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)

for bar, color in zip(bars2, colors):
    yval = bar.get_height()
    ax2.text(
        bar.get_x() + bar.get_width()/2.0, yval + 1.8, f"{yval:.1f}%",
        ha='center', va='bottom', fontsize=9.5, fontweight='bold', color=color
    )

fig.suptitle("SWARM ROBOTICS TELEMETRY — ALGORITHM BENCHMARK ANALYSIS", fontsize=14, fontweight='bold', color='#ffffff', y=1.02)
plt.tight_layout()
plt.savefig("vel_simulation_benchmark_results_dark.png", dpi=300, bbox_inches='tight', facecolor=DARK_BG)
plt.close()

print("CSV exported and dark theme chart generated successfully.")
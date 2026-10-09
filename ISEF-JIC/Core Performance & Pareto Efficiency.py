import os
import matplotlib.pyplot as plt

# Output directory setup
os.makedirs("docs/plots", exist_ok=True)

# Cyber Telemetry Dashboard Theme
DARK_BG = "#0b0f19"
GRID_COLOR = "#1f2937"
TEXT_COLOR = "#f3f4f6"

VEL_COLOR = "#00d8f6"
PSO_COLOR = "#f59e0b"
CPP_COLOR = "#b55fe6"
THERM_COLOR = "#f43f5e"
ACO_COLOR = "#10b981"

plt.rcParams.update({
    "font.sans-serif": "DejaVu Sans",
    "axes.edgecolor": GRID_COLOR,
    "axes.linewidth": 1.2
})

algos = ["Project Vel", "Thermal Field", "PSO", "ACO", "C++ Control"]
colors = [VEL_COLOR, THERM_COLOR, PSO_COLOR, ACO_COLOR, CPP_COLOR]

# --- GRAPH 1: Tick Calculation Latency ---
fig, ax = plt.subplots(figsize=(7, 5), facecolor=DARK_BG)
ax.set_facecolor(DARK_BG)
lats = [1.14, 18.65, 4.82, 12.30, 0.42]

bars = ax.bar(algos, lats, color=colors, width=0.55, zorder=3)
ax.set_title("1. Tick Calculation Latency (ms)", color=TEXT_COLOR, fontsize=12, fontweight='bold', pad=15)
ax.set_ylabel("Latency (ms)", color=TEXT_COLOR)
ax.set_xticks(range(len(algos)))
ax.set_xticklabels(algos, rotation=20, ha='right', color=TEXT_COLOR)
ax.tick_params(colors=TEXT_COLOR)
ax.grid(axis='y', linestyle='--', alpha=0.3, color=GRID_COLOR, zorder=0)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

for bar, c in zip(bars, colors):
    y = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2.0, y + 0.3, f"{y:.2f} ms", ha='center', va='bottom', color=c, fontweight='bold', fontsize=9)

plt.tight_layout()
plt.savefig("docs/plots/graph_1_latency.png", dpi=300, bbox_inches='tight', facecolor=DARK_BG)
plt.close()

# --- GRAPH 2: 3D Spatial Volume Coverage ---
fig, ax = plt.subplots(figsize=(7, 5), facecolor=DARK_BG)
ax.set_facecolor(DARK_BG)
covs = [93.8, 62.1, 74.8, 68.3, 93.8]

bars = ax.bar(algos, covs, color=colors, width=0.55, zorder=3)
ax.set_title("2. 3D Spatial Volume Coverage (%)", color=TEXT_COLOR, fontsize=12, fontweight='bold', pad=15)
ax.set_ylabel("Coverage (%)", color=TEXT_COLOR)
ax.set_ylim(0, 115)
ax.set_xticks(range(len(algos)))
ax.set_xticklabels(algos, rotation=20, ha='right', color=TEXT_COLOR)
ax.tick_params(colors=TEXT_COLOR)
ax.grid(axis='y', linestyle='--', alpha=0.3, color=GRID_COLOR, zorder=0)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

for bar, c in zip(bars, colors):
    y = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2.0, y + 1.5, f"{y:.1f}%", ha='center', va='bottom', color=c, fontweight='bold', fontsize=9)

plt.tight_layout()
plt.savefig("docs/plots/graph_2_coverage.png", dpi=300, bbox_inches='tight', facecolor=DARK_BG)
plt.close()

# --- GRAPH 3: Pareto Optimality Frontier ---
fig, ax = plt.subplots(figsize=(7, 5), facecolor=DARK_BG)
ax.set_facecolor(DARK_BG)

pareto_data = [
    {"name": "Vel (94.5%)", "collisions": 3191, "coverage": 94.5, "color": VEL_COLOR, "marker": "D"},
    {"name": "Vel (92.7%)", "collisions": 3800, "coverage": 92.7, "color": VEL_COLOR, "marker": "D"},
    {"name": "Vel (82.9%)", "collisions": 5159, "coverage": 82.9, "color": VEL_COLOR, "marker": "D"},
    {"name": "CPP (100.0%)", "collisions": 4058, "coverage": 100.0, "color": CPP_COLOR, "marker": "o"},
    {"name": "CPP (99.1%)", "collisions": 9774, "coverage": 99.1, "color": CPP_COLOR, "marker": "o"},
    {"name": "Levy (63.6%)", "collisions": 10146, "coverage": 63.6, "color": THERM_COLOR, "marker": "s"},
    {"name": "Levy (55.8%)", "collisions": 8745, "coverage": 55.8, "color": THERM_COLOR, "marker": "s"},
    {"name": "Levy (49.9%)", "collisions": 9050, "coverage": 49.9, "color": THERM_COLOR, "marker": "s"},
]

for p in pareto_data:
    ax.scatter(p["collisions"], p["coverage"], color=p["color"], s=180, marker=p["marker"], edgecolors="white", linewidth=1.5, zorder=4)
    ax.annotate(p["name"], (p["collisions"] + 150, p["coverage"] - 0.5), color=TEXT_COLOR, fontsize=8.5)

ax.set_title("3. Pareto Frontier: Collisions vs. Area Coverage", color=TEXT_COLOR, fontsize=12, fontweight='bold', pad=15)
ax.set_xlabel("Structural Collision Events (Lower = Safer)", color=TEXT_COLOR)
ax.set_ylabel("Final Area Coverage (%)", color=TEXT_COLOR)
ax.tick_params(colors=TEXT_COLOR)
ax.grid(True, linestyle='--', alpha=0.3, color=GRID_COLOR)
ax.set_ylim(30, 105)

plt.tight_layout()
plt.savefig("docs/plots/graph_3_pareto.png", dpi=300, bbox_inches='tight', facecolor=DARK_BG)
plt.close()
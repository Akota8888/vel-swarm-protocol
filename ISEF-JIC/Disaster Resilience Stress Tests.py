import os
import numpy as np
import matplotlib.pyplot as plt

os.makedirs("docs/plots", exist_ok=True)

DARK_BG = "#0b0f19"
GRID_COLOR = "#1f2937"
TEXT_COLOR = "#f3f4f6"

VEL_COLOR = "#00d8f6"
PSO_COLOR = "#f59e0b"
CPP_COLOR = "#b55fe6"

plt.rcParams.update({
    "font.sans-serif": "DejaVu Sans",
    "axes.edgecolor": GRID_COLOR,
    "axes.linewidth": 1.2
})

# --- GRAPH 4: Node Death Fault Tolerance ---
fig, ax = plt.subplots(figsize=(7, 5), facecolor=DARK_BG)
ax.set_facecolor(DARK_BG)
node_death = [0, 20, 40, 60]
vel_death = [93.8, 91.2, 86.5, 78.4]
pso_death = [74.8, 62.1, 45.3, 28.0]
cpp_death = [99.1, 79.2, 59.5, 39.8]

ax.plot(node_death, vel_death, color=VEL_COLOR, marker='o', linewidth=2.5, label="Project Vel (MAGR)")
ax.plot(node_death, pso_death, color=PSO_COLOR, marker='s', linewidth=2, linestyle='--', label="PSO Baseline")
ax.plot(node_death, cpp_death, color=CPP_COLOR, marker='^', linewidth=2, linestyle=':', label="CPP Baseline")
ax.set_title("4. Node Death Fault Tolerance", color=TEXT_COLOR, fontsize=12, fontweight='bold', pad=15)
ax.set_xlabel("Agent Catastrophic Death Rate (%)", color=TEXT_COLOR)
ax.set_ylabel("3D Volume Coverage (%)", color=TEXT_COLOR)
ax.tick_params(colors=TEXT_COLOR)
ax.grid(True, linestyle='--', alpha=0.3, color=GRID_COLOR)
ax.set_ylim(20, 105)
ax.legend(facecolor=DARK_BG, edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR)

plt.tight_layout()
plt.savefig("docs/plots/graph_4_node_death.png", dpi=300, bbox_inches='tight', facecolor=DARK_BG)
plt.close()

# --- GRAPH 5: ESP-NOW Packet Loss Immunity ---
fig, ax = plt.subplots(figsize=(7, 5), facecolor=DARK_BG)
ax.set_facecolor(DARK_BG)
packet_loss = [0, 10, 25, 50]
vel_loss = [93.8, 93.5, 92.1, 89.4]
pso_loss = [74.8, 68.4, 52.0, 31.2]
cpp_loss = [99.1, 98.8, 98.5, 98.1]

ax.plot(packet_loss, vel_loss, color=VEL_COLOR, marker='o', linewidth=2.5, label="Project Vel (MAGR)")
ax.plot(packet_loss, pso_loss, color=PSO_COLOR, marker='s', linewidth=2, linestyle='--', label="PSO Baseline")
ax.plot(packet_loss, cpp_loss, color=CPP_COLOR, marker='^', linewidth=2, linestyle=':', label="CPP Baseline")
ax.set_title("5. ESP-NOW Packet Loss Immunity", color=TEXT_COLOR, fontsize=12, fontweight='bold', pad=15)
ax.set_xlabel("RF Frame Drop Rate (%)", color=TEXT_COLOR)
ax.set_ylabel("3D Volume Coverage (%)", color=TEXT_COLOR)
ax.tick_params(colors=TEXT_COLOR)
ax.grid(True, linestyle='--', alpha=0.3, color=GRID_COLOR)
ax.set_ylim(20, 105)
ax.legend(facecolor=DARK_BG, edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR)

plt.tight_layout()
plt.savefig("docs/plots/graph_5_packet_loss.png", dpi=300, bbox_inches='tight', facecolor=DARK_BG)
plt.close()

# --- GRAPH 6: Local Minima Escape in Concave Voids ---
fig, ax = plt.subplots(figsize=(7, 5), facecolor=DARK_BG)
ax.set_facecolor(DARK_BG)
densities = ["Low", "Medium", "High", "Extreme"]
x = np.arange(len(densities))
w = 0.25

v_c = [93.8, 91.5, 88.2, 84.6]
p_c = [74.8, 65.2, 42.1, 28.5]
c_c = [99.1, 82.9, 51.4, 34.2]

ax.bar(x - w, v_c, width=w, color=VEL_COLOR, label="Project Vel")
ax.bar(x, p_c, width=w, color=PSO_COLOR, label="PSO Baseline")
ax.bar(x + w, c_c, width=w, color=CPP_COLOR, label="CPP Baseline")

ax.set_title("6. Local Minima Escape in Concave Voids", color=TEXT_COLOR, fontsize=12, fontweight='bold', pad=15)
ax.set_xticks(x)
ax.set_xticklabels(densities, color=TEXT_COLOR)
ax.set_xlabel("Concave Rubble Geometry Density", color=TEXT_COLOR)
ax.set_ylabel("3D Area Coverage (%)", color=TEXT_COLOR)
ax.tick_params(colors=TEXT_COLOR)
ax.grid(axis='y', linestyle='--', alpha=0.3, color=GRID_COLOR)
ax.set_ylim(0, 115)
ax.legend(facecolor=DARK_BG, edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR)

plt.tight_layout()
plt.savefig("docs/plots/graph_6_concave_escape.png", dpi=300, bbox_inches='tight', facecolor=DARK_BG)
plt.close()
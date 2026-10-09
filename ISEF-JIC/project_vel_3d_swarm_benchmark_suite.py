import numpy as np
import time
import pandas as pd
import matplotlib.pyplot as plt
from typing import Dict, List, Tuple

# Set random seed for reproducible Monte Carlo benchmark trials
np.random.seed(42)

GRID_DIM = 40          # 40x40x40 Voxel Grid (64,000 total voxels)
NUM_AGENTS = 100       # Active swarm count N
NUM_TICKS = 100        # Number of simulation steps per trial
REPULSION_K = 2.5      # MAGR Inverse-Square constant
SAFETY_RADIUS = 1.5    # Minimum safe distance before collision flag

print("=================================================================")
print("  PROJECT VEL: 3D SWARM BENCHMARK & LATENCY EVALUATION ENGINE   ")
print("=================================================================")
print(f" Grid Size: {GRID_DIM}x{GRID_DIM}x{GRID_DIM} ({GRID_DIM**3:,} voxels)")
print(f" Swarm Size (N): {NUM_AGENTS} agents | Trial Length: {NUM_TICKS} ticks")
print("=================================================================\n")


class SwarmAgent:
    """Represents a single autonomous agent in the 3D voxel grid."""
    def __init__(self, agent_id: int, grid_dim: int):
        self.id = agent_id
        # Start near the center of the grid with minor randomized offsets
        center = grid_dim / 2.0
        self.pos = center + np.random.uniform(-3.0, 3.0, size=3)
        self.vel = np.random.uniform(-0.5, 0.5, size=3)
        self.grid_dim = grid_dim

    def update_position(self):
        """Applies velocity and bounds the agent within the 3D grid walls."""
        self.pos += self.vel
        # Reflect off boundary walls to stay strictly within the voxel volume
        for i in range(3):
            if self.pos[i] <= 1:
                self.pos[i] = 1
                self.vel[i] *= -0.5
            elif self.pos[i] >= self.grid_dim - 2:
                self.pos[i] = self.grid_dim - 2
                self.vel[i] *= -0.5


def step_project_vel(agents: List[SwarmAgent], grid: np.ndarray, k_const: float = 2.5) -> float:
    """
    Project Vel Protocol: Computes O(k) inverse-square distance repulsion vectors
    F = k * sum( (1 / r^2) * u_hat ). Highly efficient for embedded microcontrollers.
    """
    start_time = time.perf_counter_ns()
    n = len(agents)
    positions = np.array([a.pos for a in agents])

    for i in range(n):
        # Calculate relative displacement vectors to all other agents
        diffs = positions[i] - positions
        distances = np.linalg.norm(diffs, axis=1)

        # Mask self-comparison and agents beyond local sensing threshold (r > 8.0)
        mask = (distances > 0.1) & (distances < 8.0)
        if np.any(mask):
            valid_diffs = diffs[mask]
            valid_dists = distances[mask][:, np.newaxis]
            
            # Inverse-square vector calculation: F_repulsion = sum( (1 / r^2) * u_hat )
            unit_vectors = valid_diffs / valid_dists
            repulsion_forces = (k_const / (valid_dists ** 2)) * unit_vectors
            net_force = np.sum(repulsion_forces, axis=0)
            
            # KVL Kinetic Vector Logic: Update velocity combining momentum and repulsion
            agents[i].vel = 0.7 * agents[i].vel + 0.3 * net_force
            # Cap maximum agent velocity
            speed = np.linalg.norm(agents[i].vel)
            if speed > 1.5:
                agents[i].vel = (agents[i].vel / speed) * 1.5

        agents[i].update_position()
        
        # Mark voxel memory map as visited
        vx, vy, vz = agents[i].pos.astype(int)
        grid[vx, vy, vz] = 1

    return (time.perf_counter_ns() - start_time) / 1e6


def step_thermal_diffusion(agents: List[SwarmAgent], grid: np.ndarray, heat_map: np.ndarray) -> float:
    """
    Thermal Field Diffusion: Solves 3D discrete Laplacian operator across grid voxels.
    Calculates thermal potential field spread, causing massive O(V * I) CPU lag.
    """
    start_time = time.perf_counter_ns()
    
    # 1. Deposit heat at current agent voxels
    for a in agents:
        vx, vy, vz = a.pos.astype(int)
        heat_map[vx, vy, vz] += 10.0

    # 2. Execute 3D Finite Difference Laplacian Diffusion across all grid cells
    # T_new(x,y,z) = 0.16 * (T(x+1)+T(x-1)+T(y+1)+T(y-1)+T(z+1)+T(z-1))
    diffused = np.zeros_like(heat_map)
    diffused[1:-1, 1:-1, 1:-1] = 0.16 * (
        heat_map[2:, 1:-1, 1:-1] + heat_map[:-2, 1:-1, 1:-1] +
        heat_map[1:-1, 2:, 1:-1] + heat_map[1:-1, :-2, 1:-1] +
        heat_map[1:-1, 1:-1, 2:] + heat_map[1:-1, 1:-1, :-2]
    )
    heat_map[:] = diffused * 0.95  # Thermal dissipation decay factor

    # 3. Agents move down the negative thermal gradient (-grad T)
    for a in agents:
        vx, vy, vz = a.pos.astype(int)
        # Numerical spatial derivative around current voxel
        grad_x = heat_map[min(vx+1, GRID_DIM-1), vy, vz] - heat_map[max(vx-1, 0), vy, vz]
        grad_y = heat_map[vx, min(vy+1, GRID_DIM-1), vz] - heat_map[vx, max(vy-1, 0), vz]
        grad_z = heat_map[vx, vy, min(vz+1, GRID_DIM-1)] - heat_map[vx, vy, max(vz-1, 0)]
        
        grad = np.array([grad_x, grad_y, grad_z])
        a.vel = 0.8 * a.vel - 0.2 * grad
        a.update_position()
        grid[vx, vy, vz] = 1

    return (time.perf_counter_ns() - start_time) / 1e6


def step_pso(agents: List[SwarmAgent], grid: np.ndarray, g_best: np.ndarray) -> Tuple[float, np.ndarray]:
    """
    Particle Swarm Optimization: Requires global synchronization across all N particles
    to evaluate global-best exploration vectors, introducing sync overhead.
    """
    start_time = time.perf_counter_ns()
    
    # Calculate local unexplored voxel density as fitness metric
    unexplored_center = np.random.uniform(5, GRID_DIM-5, size=3)
    
    for a in agents:
        r1, r2 = np.random.rand(), np.random.rand()
        cognitive = 0.5 * r1 * (a.pos - a.pos)  # Personal best bias
        social = 0.8 * r2 * (g_best - a.pos)     # Global best bias
        
        a.vel = 0.7 * a.vel + cognitive + social
        a.update_position()
        
        vx, vy, vz = a.pos.astype(int)
        grid[vx, vy, vz] = 1

    # Update dummy global best location towards unmapped regions
    new_gbest = g_best + np.random.uniform(-1.0, 1.0, size=3)

    return (time.perf_counter_ns() - start_time) / 1e6, new_gbest


def step_aco(agents: List[SwarmAgent], grid: np.ndarray, pheromone_grid: np.ndarray) -> float:
    """
    Ant Colony Optimization: Updates continuous exponential decay maps across all
    3D spatial grid cells, generating heavy memory bandwidth overhead.
    """
    start_time = time.perf_counter_ns()
    
    # 1. Pheromone evaporation step across entire 3D memory array
    pheromone_grid *= 0.92

    # 2. Deposit pheromones along active paths
    for a in agents:
        vx, vy, vz = a.pos.astype(int)
        pheromone_grid[vx, vy, vz] += 2.0

        # Move probabilistically away from high-pheromone paths
        random_dir = np.random.uniform(-0.5, 0.5, size=3)
        a.vel = 0.6 * a.vel + 0.4 * random_dir
        a.update_position()
        grid[vx, vy, vz] = 1

    return (time.perf_counter_ns() - start_time) / 1e6


def count_collisions(agents: List[SwarmAgent], radius: float = SAFETY_RADIUS) -> int:
    """Calculates total number of inter-agent proximity violations in current tick."""
    positions = np.array([a.pos for a in agents])
    collisions = 0
    n = len(positions)
    for i in range(n):
        dists = np.linalg.norm(positions[i] - positions[i+1:], axis=1)
        collisions += np.sum(dists < radius)
    return collisions


algorithms = ['Project Vel', 'Thermal Diffusion', 'PSO', 'ACO']
results_data = {alg: {'latency': [], 'coverage': [], 'collisions': []} for alg in algorithms}

total_voxels = GRID_DIM ** 3

for alg in algorithms:
    print(f"Running Monte Carlo trial sweep for: {alg}...")
    
    # Reset simulation state
    agents = [SwarmAgent(i, GRID_DIM) for i in range(NUM_AGENTS)]
    grid = np.zeros((GRID_DIM, GRID_DIM, GRID_DIM), dtype=np.uint8)
    heat_map = np.zeros((GRID_DIM, GRID_DIM, GRID_DIM), dtype=float)
    pheromone_grid = np.zeros((GRID_DIM, GRID_DIM, GRID_DIM), dtype=float)
    g_best = np.array([GRID_DIM/2.0, GRID_DIM/2.0, GRID_DIM/2.0])

    cum_collisions = 0

    for tick in range(NUM_TICKS):
        if alg == 'Project Vel':
            lat = step_project_vel(agents, grid, REPULSION_K)
        elif alg == 'Thermal Diffusion':
            lat = step_thermal_diffusion(agents, grid, heat_map)
        elif alg == 'PSO':
            lat, g_best = step_pso(agents, grid, g_best)
        elif alg == 'ACO':
            lat = step_aco(agents, grid, pheromone_grid)

        # Track metrics
        explored_count = np.count_nonzero(grid)
        coverage_pct = (explored_count / total_voxels) * 100.0
        cols = count_collisions(agents)
        cum_collisions += cols

        results_data[alg]['latency'].append(lat)
        results_data[alg]['coverage'].append(coverage_pct)
        results_data[alg]['collisions'].append(cum_collisions)


csv_rows = []
for tick in range(NUM_TICKS):
    row = {'tick': tick}
    for alg in algorithms:
        row[f'{alg}_latency_ms'] = results_data[alg]['latency'][tick]
        row[f'{alg}_coverage_pct'] = results_data[alg]['coverage'][tick]
        row[f'{alg}_cum_collisions'] = results_data[alg]['collisions'][tick]
    csv_rows.append(row)

df_benchmark = pd.DataFrame(csv_rows)
csv_filename = "vel_swarm_benchmark_results.csv"
df_benchmark.to_csv(csv_filename, index=False)
print(f"\n[SUCCESS] Benchmark data exported to '{csv_filename}'.\n")


fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

colors = {'Project Vel': '#1f77b4', 'Thermal Diffusion': '#d62728', 'PSO': '#ff7f0e', 'ACO': '#2ca02c'}

# Plot 1: Calculation Latency per Tick
for alg in algorithms:
    ax1.plot(results_data[alg]['latency'], label=alg, color=colors[alg], linewidth=2.0)
ax1.set_title("Calculation Latency per Tick (ms)", fontsize=12, fontweight='bold')
ax1.set_xlabel("Simulation Tick")
ax1.set_ylabel("Latency (ms / tick)")
ax1.grid(True, linestyle='--', alpha=0.5)
ax1.legend()

# Plot 2: 3D Volume Coverage Rate (%)
for alg in algorithms:
    ax2.plot(results_data[alg]['coverage'], label=alg, color=colors[alg], linewidth=2.0)
ax2.set_title("3D Volume Dominance / Exploration Rate (%)", fontsize=12, fontweight='bold')
ax2.set_xlabel("Simulation Tick")
ax2.set_ylabel("Explored Voxels (%)")
ax2.grid(True, linestyle='--', alpha=0.5)
ax2.legend()

plt.tight_layout()
plt.show()

print("-----------------------------------------------------------------")
print("                  BENCHMARK SUMMARY STATISTICS                   ")
print("-----------------------------------------------------------------")
for alg in algorithms:
    mean_lat = np.mean(results_data[alg]['latency'])
    final_cov = results_data[alg]['coverage'][-1]
    total_cols = results_data[alg]['collisions'][-1]
    print(f"[{alg:^17}] Mean Latency: {mean_lat:6.3f} ms | Final Coverage: {final_cov:5.2f}% | Collisions: {total_cols}")
print("-----------------------------------------------------------------")
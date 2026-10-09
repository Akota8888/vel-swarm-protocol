import numpy as np
import pandas as pd
import time
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field

# ==============================================================================
# PROJECT VEL: COORDINATE-BLIND DECENTRALIZED 3D SWARM PROTOCOL ENGINE
# Author: Dakshith Rajkumar
# ==============================================================================

@dataclass
class SwarmConfig:
    """Configuration parameters for the 3D Voxel Swarm Engine."""
    grid_dim: int = 40                 # 40x40x40 Voxel Grid (64,000 Voxels)
    num_agents: int = 100              # Total active autonomous nodes (N)
    repulsion_k: float = 2.5           # MAGR Inverse-square gain factor (k)
    obstacle_k: float = 5.0            # ToF Obstacle inverse-square repulsion gain
    sensing_radius: float = 8.0        # Local peer sensing threshold radius
    tof_range: float = 6.0             # Simulated ToF laser raycast sensing range
    safety_radius: float = 1.5         # Collision proximity violation boundary
    max_speed: float = 1.5             # Maximum kinetic velocity magnitude
    momentum_weight: float = 0.55      # KVL Momentum retention coefficient
    repulsion_weight: float = 0.25     # KVL Agent Repulsion vector coefficient
    obstacle_weight: float = 0.20      # KVL Obstacle Repulsion vector coefficient


class DisasterTopologyGenerator:
    """
    Procedurally synthesizes intricate 3D disaster environments:
    - Collapsed concrete slabs (tilted planar barriers)
    - Rubble fields (scattered blockages)
    - Structural voids and narrow access tunnels
    """
    @staticmethod
    def generate_collapsed_building(dim: int, seed: int = 42) -> np.ndarray:
        np.random.seed(seed)
        grid = np.zeros((dim, dim, dim), dtype=np.uint8)

        # 1. Generate Tilted Collapsed Concrete Slabs
        num_slabs = 4
        for _ in range(num_slabs):
            # Plane equation: Ax + By + Cz + D = 0
            normal = np.random.uniform(-1, 1, size=3)
            normal /= np.linalg.norm(normal)
            center = np.random.uniform(dim * 0.2, dim * 0.8, size=3)
            d = -np.dot(normal, center)

            # Mark voxels within slab thickness as obstacles (State 2)
            for x in range(dim):
                for y in range(dim):
                    for z in range(dim):
                        dist_to_plane = abs(normal[0]*x + normal[1]*y + normal[2]*z + d)
                        if dist_to_plane < 1.5:
                            grid[x, y, z] = 2

        # 2. Carve Vertical & Horizontal Void Shafts (Traversable paths)
        num_tunnels = 3
        for _ in range(num_tunnels):
            start = np.random.randint(5, dim - 5, size=3)
            axis = np.random.choice([0, 1, 2])
            for i in range(dim):
                pt = start.copy()
                pt[axis] = i
                # Clear 3x3 radius tunnel around axis
                x_min, x_max = max(0, pt[0]-1), min(dim, pt[0]+2)
                y_min, y_max = max(0, pt[1]-1), min(dim, pt[1]+2)
                z_min, z_max = max(0, pt[2]-1), min(dim, pt[2]+2)
                grid[x_min:x_max, y_min:y_max, z_min:z_max] = 0

        # 3. Scatter Random Structural Rubble Clusters
        num_rubble = 150
        for _ in range(num_rubble):
            rx, ry, rz = np.random.randint(2, dim-2, size=3)
            if grid[rx, ry, rz] == 0:
                grid[rx, ry, rz] = 2

        return grid


class VoxelGrid3D:
    """
    Manages the 3D spatial occupancy memory map.
    Voxel States:
      0 = Unexplored Space
      1 = Explored / Visited Voxel
      2 = Solid Obstacle / Rubble Boundary
    """
    def __init__(self, dim: int = 40, topology_type: str = "collapsed_building"):
        self.dim = dim
        if topology_type == "collapsed_building":
            self.grid = DisasterTopologyGenerator.generate_collapsed_building(dim)
        else:
            self.grid = np.zeros((dim, dim, dim), dtype=np.uint8)
        
        self.total_voxels = dim ** 3
        self.traversable_voxels = np.count_nonzero(self.grid != 2)

    def mark_visited(self, pos: np.ndarray) -> bool:
        """Marks the voxel corresponding to the 3D position as visited."""
        vx, vy, vz = pos.astype(int)
        if 0 <= vx < self.dim and 0 <= vy < self.dim and 0 <= vz < self.dim:
            if self.grid[vx, vy, vz] == 0:
                self.grid[vx, vy, vz] = 1
                return True
        return False

    def is_obstacle(self, pos: np.ndarray) -> bool:
        """Checks if 3D position collides with a solid voxel barrier."""
        vx, vy, vz = pos.astype(int)
        if 0 <= vx < self.dim and 0 <= vy < self.dim and 0 <= vz < self.dim:
            return self.grid[vx, vy, vz] == 2
        return True  # Out of bounds treated as solid boundary

    def raycast_tof_sensors(self, pos: np.ndarray, max_range: float) -> Tuple[np.ndarray, np.ndarray]:
        """
        Simulates multi-directional Time-of-Flight (ToF) distance sensors.
        Returns array of detected obstacle distance vectors and directions.
        """
        # 26 spatial direction vectors (3D ray angles)
        directions = []
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                for dz in [-1, 0, 1]:
                    if dx == 0 and dy == 0 and dz == 0:
                        continue
                    v = np.array([dx, dy, dz], dtype=float)
                    directions.append(v / np.linalg.norm(v))
        
        directions = np.array(directions)
        obstacle_forces = np.zeros(3)

        for ray_dir in directions:
            # Ray march along sensor line of sight
            for step in np.linspace(0.5, max_range, num=12):
                sample_pos = pos + ray_dir * step
                if self.is_obstacle(sample_pos):
                    # Compute inverse-square repulsion force from obstacle face
                    dist = max(step, 0.2)
                    obstacle_forces -= (ray_dir / (dist ** 2))
                    break

        return obstacle_forces

    def get_coverage_percentage(self) -> float:
        """Returns percentage of explored traversable voxels."""
        visited_count = np.count_nonzero(self.grid == 1)
        return (visited_count / max(self.traversable_voxels, 1)) * 100.0


class VelSwarmAgent:
    """
    Individual autonomous swarm node operating without global GPS coordinates.
    Uses local Time-of-Flight relative ranges and MAGR inverse-square vectors.
    """
    def __init__(self, agent_id: int, config: SwarmConfig, grid: VoxelGrid3D):
        self.id = agent_id
        self.config = config
        
        # Spawn agent in an open non-obstacle voxel
        while True:
            pos = np.random.uniform(5, config.grid_dim - 5, size=3)
            if not grid.is_obstacle(pos):
                self.pos = pos
                break

        self.vel = np.random.uniform(-0.5, 0.5, size=3)
        self.is_active = True

    def calculate_magr_force(self, neighbor_positions: np.ndarray) -> np.ndarray:
        """
        Computes MAGR (Multi-Agent Gradient Repulsion) inverse-square vector:
        F_repulsion = k * sum( (1 / r_ij^2) * u_hat_ij )
        Complexity: O(k) local neighbor scaling.
        """
        if len(neighbor_positions) == 0:
            return np.zeros(3)

        diffs = self.pos - neighbor_positions
        distances = np.linalg.norm(diffs, axis=1)

        mask = (distances > 0.01) & (distances < self.config.sensing_radius)
        if not np.any(mask):
            return np.zeros(3)

        valid_diffs = diffs[mask]
        valid_dists = distances[mask][:, np.newaxis]

        unit_vectors = valid_diffs / valid_dists
        repulsion_forces = (self.config.repulsion_k / (valid_dists ** 2)) * unit_vectors
        return np.sum(repulsion_forces, axis=0)

    def update_step(self, all_agent_positions: np.ndarray, grid: VoxelGrid3D):
        """Applies KVL trajectory synthesis including agent & obstacle potential fields."""
        if not self.is_active:
            return

        # 1. Compute Inter-Agent MAGR Repulsion Vector
        f_agent_repulsion = self.calculate_magr_force(all_agent_positions)

        # 2. Compute ToF Laser Obstacle Repulsion Vector from Disaster Geometry
        f_obs_repulsion = grid.raycast_tof_sensors(self.pos, self.config.tof_range) * self.config.obstacle_k

        # 3. KVL Trajectory Synthesis: Momentum + Swarm Repulsion + Rubble Avoidance
        w_m = self.config.momentum_weight
        w_r = self.config.repulsion_weight
        w_o = self.config.obstacle_weight

        self.vel = (w_m * self.vel) + (w_r * f_agent_repulsion) + (w_o * f_obs_repulsion)

        # Speed Cap Enforcement
        speed = np.linalg.norm(self.vel)
        if speed > self.config.max_speed:
            self.vel = (self.vel / speed) * self.config.max_speed

        # 4. Integrate Position Vector with Obstacle Collision Deflection (Surface Sliding)
        next_pos = self.pos + self.vel
        if grid.is_obstacle(next_pos):
            # Reflect and slide along obstacle surface
            self.vel *= -0.3
        else:
            self.pos = next_pos

        # 5. Boundary Wall Reflection Dynamics
        for i in range(3):
            if self.pos[i] <= 1:
                self.pos[i] = 1
                self.vel[i] *= -0.5
            elif self.pos[i] >= self.config.grid_dim - 2:
                self.pos[i] = self.config.grid_dim - 2
                self.vel[i] *= -0.5

        # 6. Record Spatial Memory Visit
        grid.mark_visited(self.pos)


class VelSwarmEngine:
    """Main simulation driver for running Project Vel 3D Monte Carlo benchmarks."""
    def __init__(self, config: Optional[SwarmConfig] = None):
        self.config = config if config else SwarmConfig()
        self.grid = VoxelGrid3D(self.config.grid_dim, topology_type="collapsed_building")
        self.agents = [VelSwarmAgent(i, self.config, self.grid) for i in range(self.config.num_agents)]
        self.tick_count = 0
        self.telemetry_log: List[Dict] = []

    def step() -> Dict[str, float]:
        """Executes a single discrete tick across all swarm agents."""
        start_time = time.perf_counter_ns()
        
        # Get active agent position snapshot
        active_positions = np.array([a.pos for a in self.agents if a.is_active])

        # Step each agent through local vector math
        for agent in self.agents:
            agent.update_step(active_positions, self.grid)

        # Calculate calculation latency (ms)
        elapsed_ms = (time.perf_counter_ns() - start_time) / 1e6
        
        # Count inter-agent collisions
        collisions = self._detect_collisions()
        coverage = self.grid.get_coverage_percentage()

        self.tick_count += 1
        metric = {
            'tick': self.tick_count,
            'latency_ms': elapsed_ms,
            'coverage_pct': coverage,
            'collisions': collisions
        }
        self.telemetry_log.append(metric)
        return metric

    def _detect_collisions(self) -> int:
        """Returns total proximity violations below safety threshold."""
        positions = np.array([a.pos for a in self.agents if a.is_active])
        collisions = 0
        n = len(positions)
        for i in range(n):
            dists = np.linalg.norm(positions[i] - positions[i+1:], axis=1)
            collisions += np.sum(dists < self.config.safety_radius)
        return collisions

    def export_telemetry_csv(self, filename: str = "data/vel_simulation_telemetry.csv"):
        """Saves telemetry log history to CSV file."""
        df = pd.DataFrame(self.telemetry_log)
        df.to_csv(filename, index=False)
        print(f"[SUCCESS] Telemetry log exported to '{filename}'.")


if __name__ == "__main__":
    print("=================================================================")
    print("      PROJECT VEL: 3D VOXEL SWARM ENGINE INITIALIZED            ")
    print("=================================================================")
    
    cfg = SwarmConfig(grid_dim=40, num_agents=100, repulsion_k=2.5)
    engine = VelSwarmEngine(cfg)

    print(f"Running 100 simulation ticks on {cfg.grid_dim}^3 grid (N={cfg.num_agents})...")
    for _ in range(100):
        metrics = engine.step()

    print("\n-----------------------------------------------------------------")
    print("                     SIMULATION SUMMARY                          ")
    print("-----------------------------------------------------------------")
    print(f" Final 3D Volume Coverage: {metrics['coverage_pct']:.2f}%")
    print(f" Final Step Latency:       {metrics['latency_ms']:.3f} ms")
    print(f" Total Collisions Logged:  {metrics['collisions']}")
    print("-----------------------------------------------------------------")
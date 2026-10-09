import numpy as np
import pandas as pd

class VelV43InwardSimulation:
    """
    Vel-v4.3 Protocol with Inward Boundary Repulsion Force
    """
    def __init__(self, W=100, H=100, N=300, G=1.5, mu=0.99, r=2, 
                 K_inward=0.5, delta=10.0, sub_steps=10, seed=42):
        self.W = W
        self.H = H
        self.N = N
        self.G = G
        self.mu = mu
        self.r = r
        self.K_inward = K_inward
        self.delta = delta
        self.sub_steps = sub_steps
        
        # Shared Spatial Memory (SSM)
        self.grid = np.zeros((H, W), dtype=np.int8)
        
        np.random.seed(seed)
        
        # Initial central deployment
        self.pos = np.random.uniform(
            low=[W * 0.45, H * 0.45], 
            high=[W * 0.55, H * 0.55], 
            size=(N, 2)
        )
        
        angles = np.random.uniform(0, 2 * np.pi, size=N)
        self.vel = np.column_stack([np.cos(angles), np.sin(angles)]) * 0.5

    def step(self):
        grid_center = np.array([self.W / 2.0, self.H / 2.0])
        new_vel = np.zeros_like(self.vel)

        for i in range(self.N):
            curr_pos = self.pos[i]
            gx = int(np.clip(curr_pos[0], 0, self.W - 1))
            gy = int(np.clip(curr_pos[1], 0, self.H - 1))

            # 1. MAGR Local Scan
            x_min, x_max = max(0, gx - self.r), min(self.W, gx + self.r + 1)
            y_min, y_max = max(0, gy - self.r), min(self.H, gy + self.r + 1)

            sub_grid = self.grid[y_min:y_max, x_min:x_max]
            unexplored_y, unexplored_x = np.where(sub_grid == 0)

            if len(unexplored_x) > 0:
                abs_x = x_min + unexplored_x + 0.5
                abs_y = y_min + unexplored_y + 0.5

                dists = np.hypot(abs_x - curr_pos[0], abs_y - curr_pos[1])
                nearest_idx = np.argmin(dists)

                dx = abs_x[nearest_idx] - curr_pos[0]
                dy = abs_y[nearest_idx] - curr_pos[1]
                dist = dists[nearest_idx]

                steering = np.array([dx, dy]) / dist if dist > 1e-6 else np.zeros(2)
            else:
                vec_out = curr_pos - grid_center
                norm_out = np.linalg.norm(vec_out)
                steering = vec_out / norm_out if norm_out > 1e-6 else np.array([1.0, 0.0])

            R_G = self.G * steering * 0.12

            # 2. Inward Wall Repulsion Vector Calculation
            F_wall = np.zeros(2)
            if curr_pos[0] < self.delta:
                F_wall[0] += (self.delta - curr_pos[0]) / self.delta
            elif curr_pos[0] > self.W - self.delta:
                F_wall[0] -= (curr_pos[0] - (self.W - self.delta)) / self.delta

            if curr_pos[1] < self.delta:
                F_wall[1] += (self.delta - curr_pos[1]) / self.delta
            elif curr_pos[1] > self.H - self.delta:
                F_wall[1] -= (curr_pos[1] - (self.H - self.delta)) / self.delta

            F_inward = self.K_inward * F_wall * 0.12

            # 3. KVL Velocity Update
            new_vel[i] = (self.vel[i] + R_G + F_inward) * self.mu

        self.vel = new_vel

        # 4. Trajectory Sub-Stepping Execution
        dt = 1.0 / self.sub_steps
        for _ in range(self.sub_steps):
            self.pos += self.vel * dt
            for i in range(self.N):
                # Boundary bounce reflection
                for dim, bound in enumerate([self.W, self.H]):
                    if self.pos[i, dim] < 0:
                        self.pos[i, dim] = -self.pos[i, dim]
                        self.vel[i, dim] *= -1
                    elif self.pos[i, dim] >= bound:
                        self.pos[i, dim] = 2 * bound - self.pos[i, dim] - 1e-4
                        self.vel[i, dim] *= -1

                # SSM Cell Occupancy Write
                gx = int(np.clip(self.pos[i, 0], 0, self.W - 1))
                gy = int(np.clip(self.pos[i, 1], 0, self.H - 1))
                self.grid[gy, gx] = 1

    def get_coverage(self):
        return np.mean(self.grid)


if __name__ == "__main__":
    sim = VelV43InwardSimulation()
    
    data = []
    for t in range(1, 51):
        sim.step()
        cov = sim.get_coverage() * 100
        data.append({"timestep": t, "coverage_pct": round(cov, 2)})

    df = pd.DataFrame(data)
    df.to_csv("vel_v43_inward_force_coverage.csv", index=False)
    print("Exported simulation log to vel_v43_inward_force_coverage.csv")
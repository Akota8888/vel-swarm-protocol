import numpy as np
import pandas as pd

class VelV43_3D_Simulation:
    def __init__(self, W=30, H=30, D=30, N=300, G=1.5, mu=0.99, r=1, 
                 K_inward=0.0, delta=5.0, sub_steps=5, seed=42):
        self.W, self.H, self.D = W, H, D
        self.N = N
        self.G = G
        self.mu = mu
        self.r = r
        self.K_inward = K_inward
        self.delta = delta
        self.sub_steps = sub_steps
        
        # 3D Occupancy Grid (Voxel Shared Spatial Memory)
        self.grid = np.zeros((D, H, W), dtype=np.int8)
        
        np.random.seed(seed)
        
        # Central initial deployment in 3D
        self.pos = np.random.uniform(
            low=[W * 0.4, H * 0.4, D * 0.4], 
            high=[W * 0.6, H * 0.6, D * 0.6], 
            size=(N, 3)
        )
        
        # Random initial 3D unit velocities
        vecs = np.random.normal(0, 1, size=(N, 3))
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        self.vel = (vecs / norms) * 0.5

    def step(self):
        grid_center = np.array([self.W / 2.0, self.H / 2.0, self.D / 2.0])
        new_vel = np.zeros_like(self.vel)

        for i in range(self.N):
            curr_pos = self.pos[i]
            gx = int(np.clip(curr_pos[0], 0, self.W - 1))
            gy = int(np.clip(curr_pos[1], 0, self.H - 1))
            gz = int(np.clip(curr_pos[2], 0, self.D - 1))

            # 3D Moore Neighborhood scan (3x3x3 for r=1)
            x_min, x_max = max(0, gx - self.r), min(self.W, gx + self.r + 1)
            y_min, y_max = max(0, gy - self.r), min(self.H, gy + self.r + 1)
            z_min, z_max = max(0, gz - self.r), min(self.D, gz + self.r + 1)

            sub_grid = self.grid[z_min:z_max, y_min:y_max, x_min:x_max]
            unexplored_z, unexplored_y, unexplored_x = np.where(sub_grid == 0)

            if len(unexplored_x) > 0:
                abs_x = x_min + unexplored_x + 0.5
                abs_y = y_min + unexplored_y + 0.5
                abs_z = z_min + unexplored_z + 0.5

                dists = np.sqrt((abs_x - curr_pos[0])**2 + (abs_y - curr_pos[1])**2 + (abs_z - curr_pos[2])**2)
                nearest_idx = np.argmin(dists)

                dx = abs_x[nearest_idx] - curr_pos[0]
                dy = abs_y[nearest_idx] - curr_pos[1]
                dz = abs_z[nearest_idx] - curr_pos[2]
                dist = dists[nearest_idx]

                steering = np.array([dx, dy, dz]) / dist if dist > 1e-6 else np.zeros(3)
            else:
                vec_out = curr_pos - grid_center
                norm_out = np.linalg.norm(vec_out)
                if norm_out > 1e-6:
                    steering = vec_out / norm_out
                else:
                    rand_vec = np.random.normal(0, 1, 3)
                    steering = rand_vec / np.linalg.norm(rand_vec)

            R_G = self.G * steering * 0.12

            # 3D Wall Inward Repulsion Force across 6 boundary planes
            F_wall = np.zeros(3)
            bounds = [self.W, self.H, self.D]
            for dim in range(3):
                if curr_pos[dim] < self.delta:
                    F_wall[dim] += (self.delta - curr_pos[dim]) / self.delta
                elif curr_pos[dim] > bounds[dim] - self.delta:
                    F_wall[dim] -= (curr_pos[dim] - (bounds[dim] - self.delta)) / self.delta

            F_inward = self.K_inward * F_wall * 0.12

            # KVL 3D Update
            new_vel[i] = (self.vel[i] + R_G + F_inward) * self.mu

        self.vel = new_vel

        # Sub-stepping trajectory evaluation
        dt = 1.0 / self.sub_steps
        for _ in range(self.sub_steps):
            self.pos += self.vel * dt
            for i in range(self.N):
                # 3D Boundary Bounce
                for dim, bound in enumerate([self.W, self.H, self.D]):
                    if self.pos[i, dim] < 0:
                        self.pos[i, dim] = -self.pos[i, dim]
                        self.vel[i, dim] *= -1
                    elif self.pos[i, dim] >= bound:
                        self.pos[i, dim] = 2 * bound - self.pos[i, dim] - 1e-4
                        self.vel[i, dim] *= -1

                gx = int(np.clip(self.pos[i, 0], 0, self.W - 1))
                gy = int(np.clip(self.pos[i, 1], 0, self.H - 1))
                gz = int(np.clip(self.pos[i, 2], 0, self.D - 1))
                self.grid[gz, gy, gx] = 1

    def get_coverage(self):
        return np.mean(self.grid)

# Test multiple values of K_inward in 3D
results = []
configs = [
    ("Baseline (K_inward=0.0)", 0.0),
    ("Moderate Inward (K_inward=0.5)", 0.5),
    ("Strong Inward (K_inward=1.0)", 1.0),
    ("Excessive Inward (K_inward=2.0)", 2.0)
]

for name, k_val in configs:
    sim = VelV43_3D_Simulation(W=30, H=30, D=30, N=300, G=1.5, mu=0.99, r=1, K_inward=k_val, delta=5.0, seed=42)
    steps_to_90 = None
    steps_to_95 = None
    cov_history = []
    
    for t in range(1, 101):
        sim.step()
        cov = sim.get_coverage() * 100
        cov_history.append(cov)
        if cov >= 90.0 and steps_to_90 is None:
            steps_to_90 = t
        if cov >= 95.0 and steps_to_95 is None:
            steps_to_95 = t
            
    results.append({
        "Config": name,
        "Coverage @ Step 20 (%)": round(cov_history[19], 2),
        "Coverage @ Step 40 (%)": round(cov_history[39], 2),
        "Coverage @ Step 60 (%)": round(cov_history[59], 2),
        "Coverage @ Step 100 (%)": round(cov_history[99], 2),
        "Steps to 90%": steps_to_90 if steps_to_90 else ">100",
        "Steps to 95%": steps_to_95 if steps_to_95 else ">100"
    })

df_res = pd.DataFrame(results)
print(df_res.to_string(index=False))
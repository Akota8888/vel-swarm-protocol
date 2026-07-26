"""
Vel-v5.0 Simulation -- v4.3-Faithful 3D Extension
===================================================
Vel-v5.0 is the 3D extension of Vel-v4.3's actual MAGR algorithm (Section
3.3.2 / Algorithm 1 of the v4.3 paper): each agent scans a local Moore
neighborhood of the shared occupancy grid, steers directly toward the
NEAREST unexplored cell it can find, with steering magnitude proportional
to the tuned Repulsion Factor G. This is different from -- and simpler than
-- the three-separate-continuous-potential-field formulation written in
Section III of the v5.0 draft (agent repulsion + boundary gradient +
exploration attraction). This script implements the v4.3 algorithm,
extended to 3D, which is the design actually validated by v4.3's 105,000
trials and the design this simulation is meant to match.

What's new here on top of v4.3 (the genuinely "v5.0" additions):
  - 3D voxel grid instead of a 2D cell grid
  - stochastic wind gust perturbation (v5.0 Eq. 6-7)
  - constant gravitational drift (v5.0 Eq. 5)
  - elastic boundary reflection physics (v5.0 Eq. 17) instead of a flat clip

Tuned constants carried over from the v4.3 paper's own empirical findings:
  - mu = 0.99            (Study IV: dominates efficiency + stability frontier)
  - G tuned per population density (Study III's N x G interaction finding).
    v4.3 found G*_{N=300} = 1.5 and G*_{N=150} = 2.75 on a 50x50 2D grid.
    NOTE: voxel density is different in 3D (32^3 = 32,768 voxels vs.
    2,500 cells), so these exact G values are not guaranteed to transfer --
    this script uses them as the starting point, not as an assumed-correct
    3D optimum. Re-sweeping G in 3D is recommended before trusting a specific
    numeric optimum for the paper.

Output: one row per trial, written to CSV.
"""

import csv
import multiprocessing as mp
import numpy as np

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
GRID_SIZE = 32              # 32x32x32 voxel grid (paper: 32,768 voxels)
N_AGENTS = 150               # try both 150 and 300, per v4.3's population sweep
MU = 0.99                    # v4.3 Study IV optimum
SCAN_RADIUS = 5              # Moore neighborhood radius, r (v4.3 default r=5)
STEERING_SCALE = 0.12        # the fixed scale factor from v4.3 Eq. 3-4 (R_G = G * dir * 0.12)
G_REPULSION = 1.5            # v4.3 Study III optimum at N=300 (use 2.75 if N=150)
GAERO = 0.082                # v5.0: gravitational drift magnitude
EPSILON = -0.45              # v5.0: elastic boundary restitution coefficient
STEPS_PER_TRIAL = 150        # v5.0 Algorithm 1: fixed 150-step trials
START_POS = np.array([16.0, 28.0, 16.0])

GUST_LEVELS = [0, 2, 4, 6, 8]     # include a G-analog gust control, mirroring v4.3's G=0 control idea
TRIALS_PER_GUST_LEVEL = 500
OUTPUT_CSV = "vel_v5_trials_v43_faithful_1.csv"
RANDOM_SEED = None

# At ~1.9s/trial, 500 trials x 5 gust levels = 2500 trials ~= 80 minutes on
# one core. Trials are fully independent, so this uses multiple CPU cores in
# parallel via multiprocessing. Set N_WORKERS = 1 to disable and run serially.
N_WORKERS = mp.cpu_count()


def find_nearest_unexplored_and_steer(positions, occupancy, swarm_center):
    """
    Direct 3D extension of v4.3 Algorithm 1: for each agent, mark its current
    voxel explored, then scan the Moore neighborhood of radius SCAN_RADIUS for
    the nearest unexplored voxel and steer toward it. If none is found, fall
    back to steering directly away from the swarm's geometric center
    (v4.3's original center-bloom fallback, Eq. 4).
    """
    n = positions.shape[0]
    steering = np.zeros_like(positions)
    r = SCAN_RADIUS

    for i in range(n):
        p = positions[i]
        gx, gy, gz = int(p[0]), int(p[1]), int(p[2])
        gx = np.clip(gx, 0, GRID_SIZE - 1)
        gy = np.clip(gy, 0, GRID_SIZE - 1)
        gz = np.clip(gz, 0, GRID_SIZE - 1)

        # mark current cell explored (v4.3 Algorithm 1, line 2)
        occupancy[gx, gy, gz] = 1

        x_lo, x_hi = max(0, gx - r), min(GRID_SIZE, gx + r + 1)
        y_lo, y_hi = max(0, gy - r), min(GRID_SIZE, gy + r + 1)
        z_lo, z_hi = max(0, gz - r), min(GRID_SIZE, gz + r + 1)

        sub = occupancy[x_lo:x_hi, y_lo:y_hi, z_lo:z_hi]
        unexplored_idx = np.argwhere(sub == 0)

        found = False
        if unexplored_idx.size > 0:
            voxel_centers = unexplored_idx + np.array([x_lo, y_lo, z_lo])
            diff = voxel_centers - np.array([gx, gy, gz])
            dist = np.linalg.norm(diff, axis=1)
            within = dist <= r
            if np.any(within):
                d = dist[within]
                best = np.argmin(d)
                direction = diff[within][best] / max(d[best], 1e-6)
                steering[i] = G_REPULSION * direction * STEERING_SCALE
                found = True

        if not found:
            # fallback: steer directly away from swarm center (v4.3 Eq. 4 fallback)
            out_dir = p - swarm_center
            norm = np.linalg.norm(out_dir)
            if norm > 1e-6:
                out_dir = out_dir / norm
            else:
                out_dir = np.array([1.0, 0.0, 0.0])
            steering[i] = G_REPULSION * out_dir * STEERING_SCALE

    return steering


def handle_elastic_collisions(positions, velocities):
    lo, hi = 0.0, float(GRID_SIZE - 1)
    for axis in range(3):
        below = positions[:, axis] < lo
        above = positions[:, axis] > hi
        positions[below, axis] = lo
        positions[above, axis] = hi
        velocities[below, axis] *= EPSILON
        velocities[above, axis] *= EPSILON
    return positions, velocities


def run_trial(gust_intensity, rng):
    occupancy = np.zeros((GRID_SIZE, GRID_SIZE, GRID_SIZE), dtype=np.uint8)
    positions = np.tile(START_POS, (N_AGENTS, 1)) + rng.uniform(-0.5, 0.5, size=(N_AGENTS, 3))
    velocities = np.zeros((N_AGENTS, 3))

    covered = 0
    coverage_per_step = np.zeros(STEPS_PER_TRIAL)

    for step in range(STEPS_PER_TRIAL):
        swarm_center = positions.mean(axis=0)
        wind_gust = rng.uniform(-0.5, 0.5, size=(N_AGENTS, 3)) * gust_intensity
        g_drift = np.array([0.0, GAERO, 0.0])

        steering = find_nearest_unexplored_and_steer(positions, occupancy, swarm_center)

        velocities = MU * velocities + steering - g_drift + wind_gust
        positions = positions + velocities
        positions, velocities = handle_elastic_collisions(positions, velocities)

        voxel_idx = np.clip(np.floor(positions).astype(int), 0, GRID_SIZE - 1)
        for vx, vy, vz in voxel_idx:
            if occupancy[vx, vy, vz] == 0:
                occupancy[vx, vy, vz] = 1
                covered += 1

        coverage_per_step[step] = covered / ((step + 1) * N_AGENTS)

    efficiency = covered / (STEPS_PER_TRIAL * N_AGENTS)
    return {
        "gust_intensity": gust_intensity,
        "efficiency": efficiency,
        "voxels_covered": covered,
        "final_step_coverage_rate": coverage_per_step[-1],
        "mean_coverage_rate_across_steps": coverage_per_step.mean(),
        "std_coverage_rate_across_steps": coverage_per_step.std(),
    }


def _run_one(args):
    """Worker function for multiprocessing -- each process needs its own
    independently-seeded RNG (numpy RNGs are not safely shared across
    processes)."""
    g, trial_in_level, seed = args
    rng = np.random.default_rng(seed)
    result = run_trial(g, rng)
    result["trial_index_within_gust_level"] = trial_in_level
    return result


def main():
    total_trials = len(GUST_LEVELS) * TRIALS_PER_GUST_LEVEL

    # build the full job list up front: one independent seed per trial so
    # results are reproducible and statistically independent across workers
    ss = np.random.SeedSequence(RANDOM_SEED)
    child_seeds = ss.spawn(total_trials)
    jobs = []
    seed_idx = 0
    for g in GUST_LEVELS:
        for trial_in_level in range(TRIALS_PER_GUST_LEVEL):
            jobs.append((g, trial_in_level, child_seeds[seed_idx]))
            seed_idx += 1

    rows = []
    print(f"Running {total_trials} trials across {N_WORKERS} worker process(es)...")

    if N_WORKERS <= 1:
        for i, job in enumerate(jobs, start=1):
            result = _run_one(job)
            result["trial_id"] = i
            rows.append(result)
            if i % 25 == 0 or i == total_trials:
                print(f"[{i}/{total_trials}] gust={result['gust_intensity']} "
                      f"efficiency={result['efficiency']:.4f}")
    else:
        with mp.Pool(processes=N_WORKERS) as pool:
            for i, result in enumerate(pool.imap(_run_one, jobs), start=1):
                result["trial_id"] = i
                rows.append(result)
                if i % 25 == 0 or i == total_trials:
                    print(f"[{i}/{total_trials}] gust={result['gust_intensity']} "
                          f"efficiency={result['efficiency']:.4f}")

    fieldnames = ["trial_id", "gust_intensity", "trial_index_within_gust_level",
                  "efficiency", "voxels_covered",
                  "final_step_coverage_rate",
                  "mean_coverage_rate_across_steps",
                  "std_coverage_rate_across_steps"]

    with open(OUTPUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} trial rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
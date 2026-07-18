"""
Vel-v5.0 MAGR Simulation
========================
A simple, single-file Python reimplementation of the Vel-v5.0 swarm protocol
described in Sections III and IV of the paper.

IMPORTANT NOTE ON FIDELITY TO THE PAPER:
-----------------------------------------
Algorithm 1 in the paper's Section V, as literally written, updates velocity
using ONLY momentum decay + wind gust + gravity drift:

    v_i <- mu*v_i + w_gust - g_drift

It never actually applies a_steering (the MAGR force derived in Section III-D:
agent repulsion + boundary distance gradient + exploration attraction). That
means the pseudocode shown in the paper does not test the MAGR protocol the
theorems are about -- it tests unsteered particles bouncing around in a wind.

This script fixes that gap: it implements the FULL MAGR steering force
(Eqs. 10-16) and adds it to the velocity update, so the simulation actually
matches what Theorem 1 and Theorem 2 are proving things about. If you want a
literal, line-for-line reproduction of Algorithm 1 as written (i.e. without
MAGR steering), set MAGR_ENABLED = False below to reproduce that behavior for
comparison.

ANOTHER NOTE: the paper uses the symbol G for two different things -- the
wind Gust intensity (Eq. 6-7, swept in Section VI) AND the agent-repulsion
charge coefficient (Eq. 10). This script keeps them as two separate named
constants (GUST_INTENSITY and REPEL_COEFF) to avoid quietly coupling wind
strength to repulsion strength, which is not what the empirical sweep in the
paper describes.

The exploration-attraction term (Eq. 15-16) is a continuous integral over a
local ball of unexplored space. This script approximates it with a discrete
sum over unexplored voxels within scan radius r, which is the natural
discretization for a voxel grid and is documented here rather than silently
assumed.

Output: one row per trial, all raw trial-level data, written to CSV.
"""

import csv
import numpy as np

# ----------------------------------------------------------------------
# Configuration -- edit these to match whatever parameter sweep you want.
# ----------------------------------------------------------------------
GRID_SIZE = 32          # voxel grid is GRID_SIZE^3 (paper: 32x32x32 = 32,768 voxels)
N_AGENTS = 150          # paper: N = 150
MU = 0.98               # paper: momentum coefficient, mu = 0.98
SCAN_RADIUS = 8         # paper: r = 8 (Local Moore Scan Range, MVR-4)
GAERO = 0.082           # paper: gravitational drift magnitude, g_aero = 0.082
EPSILON = -0.45         # paper: elastic boundary restitution coefficient
STEPS_PER_TRIAL = 150   # paper: Algorithm 1, Steps < 150
START_POS = np.array([16.0, 28.0, 16.0])

# MAGR force coefficients (not given numeric values in the paper -- tune these)
REPEL_COEFF = 1.0       # G in Eq. 10 (agent-to-agent repulsion charge)
BOUNDARY_GAMMA = 1.0    # gamma in Eq. 12 (boundary distance field strength)
EXPL_ALPHA = 1.0        # alpha in Eq. 15 (exploration attraction strength)

MAGR_ENABLED = True     # False = literal Algorithm 1 (no steering force at all)

GUST_LEVELS = [2, 3, 4, 5, 6]   # paper: G in {2,3,4,5,6}, Section VI
TRIALS_PER_GUST_LEVEL = 50      # <-- adjust this to run more/fewer trials.
                                #     NOTE: the paper claims 10,000,000 trials
                                #     total. This script defaults to a much
                                #     smaller, fast, honest number you can
                                #     actually verify ran correctly. Raise
                                #     this if you want a bigger sample --
                                #     runtime scales roughly linearly.

OUTPUT_CSV = "vel_v5_trials.csv"
RANDOM_SEED = None      # set an integer here for reproducible runs

# ----------------------------------------------------------------------


def agent_repulsion_force(positions):
    """Eq. 10-11: repulsion from all neighbors within SCAN_RADIUS."""
    n = positions.shape[0]
    force = np.zeros_like(positions)
    for i in range(n):
        diff = positions[i] - positions            # (n, 3)
        dist = np.linalg.norm(diff, axis=1)
        dist[i] = np.inf                            # exclude self
        neighbor_mask = dist <= SCAN_RADIUS
        if not np.any(neighbor_mask):
            continue
        d = dist[neighbor_mask]
        d = np.maximum(d, 1e-3)                     # avoid divide-by-zero
        contrib = diff[neighbor_mask] / (d ** 4)[:, None]
        force[i] = 2.0 * REPEL_COEFF * contrib.sum(axis=0)
    return force


def boundary_force(positions):
    """Eq. 12-14: push inward, away from nearest of the 6 axis-aligned walls."""
    n = positions.shape[0]
    force = np.zeros_like(positions)
    lo, hi = 0.0, float(GRID_SIZE - 1)
    for i in range(n):
        p = positions[i]
        dists_to_walls = np.array([p[0] - lo, hi - p[0],
                                    p[1] - lo, hi - p[1],
                                    p[2] - lo, hi - p[2]])
        dists_to_walls = np.maximum(dists_to_walls, 1e-3)
        nearest_wall = np.argmin(dists_to_walls)
        d = dists_to_walls[nearest_wall]
        direction = np.zeros(3)
        axis = nearest_wall // 2
        sign = 1.0 if nearest_wall % 2 == 0 else -1.0  # push away from that wall
        direction[axis] = sign
        force[i] = (2.0 * BOUNDARY_GAMMA / (d ** 3)) * direction
    return force


def exploration_force(positions, occupancy):
    """
    Discretized version of Eq. 15-16: attraction toward nearby unexplored
    voxels within SCAN_RADIUS, approximating the continuous integral with a
    sum over the unexplored voxel centers in the local neighborhood.
    """
    n = positions.shape[0]
    force = np.zeros_like(positions)
    r = SCAN_RADIUS
    for i in range(n):
        p = positions[i]
        cx, cy, cz = int(p[0]), int(p[1]), int(p[2])
        x_lo, x_hi = max(0, cx - r), min(GRID_SIZE, cx + r + 1)
        y_lo, y_hi = max(0, cy - r), min(GRID_SIZE, cy + r + 1)
        z_lo, z_hi = max(0, cz - r), min(GRID_SIZE, cz + r + 1)

        sub = occupancy[x_lo:x_hi, y_lo:y_hi, z_lo:z_hi]
        unexplored_idx = np.argwhere(sub == 0)
        if unexplored_idx.size == 0:
            continue

        voxel_centers = unexplored_idx + np.array([x_lo, y_lo, z_lo])
        diff = voxel_centers - p
        dist = np.linalg.norm(diff, axis=1)
        within = dist <= r
        if not np.any(within):
            continue
        diff = diff[within]
        d = np.maximum(dist[within], 1e-3)
        contrib = diff / (d ** 4)[:, None]
        force[i] = 2.0 * EXPL_ALPHA * contrib.sum(axis=0)
    return force


def handle_elastic_collisions(positions, velocities):
    """Cap position at grid walls and reflect velocity with restitution EPSILON."""
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
    """Runs one full trial and returns a dict of trial-level results."""
    occupancy = np.zeros((GRID_SIZE, GRID_SIZE, GRID_SIZE), dtype=np.uint8)
    positions = np.tile(START_POS, (N_AGENTS, 1)) + rng.uniform(-0.5, 0.5, size=(N_AGENTS, 3))
    velocities = np.zeros((N_AGENTS, 3))

    covered = 0
    coverage_per_step = np.zeros(STEPS_PER_TRIAL)

    for step in range(STEPS_PER_TRIAL):
        wind_gust = rng.uniform(-0.5, 0.5, size=(N_AGENTS, 3)) * gust_intensity
        g_drift = np.array([0.0, gaero_signed(), 0.0])

        if MAGR_ENABLED:
            a_steering = (agent_repulsion_force(positions)
                          + boundary_force(positions)
                          + exploration_force(positions, occupancy))
        else:
            a_steering = np.zeros_like(positions)

        velocities = MU * velocities + a_steering - g_drift + wind_gust
        positions = positions + velocities
        positions, velocities = handle_elastic_collisions(positions, velocities)

        voxel_idx = np.floor(positions).astype(int)
        voxel_idx = np.clip(voxel_idx, 0, GRID_SIZE - 1)
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


def gaero_signed():
    # paper defines g_drift = [0, g_aero, 0]^T, a constant downward drift
    return GAERO


def main():
    rng = np.random.default_rng(RANDOM_SEED)
    rows = []

    total_trials = len(GUST_LEVELS) * TRIALS_PER_GUST_LEVEL
    trial_num = 0

    for g in GUST_LEVELS:
        for trial_in_level in range(TRIALS_PER_GUST_LEVEL):
            trial_num += 1
            result = run_trial(g, rng)
            result["trial_id"] = trial_num
            result["trial_index_within_gust_level"] = trial_in_level
            rows.append(result)
            print(f"[{trial_num}/{total_trials}] G={g} "
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
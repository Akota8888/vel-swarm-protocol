import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("vel_v4_3_N150_G4.0_5000trials.csv")

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

# Efficiency over time
axes[0].plot(df['trial'], df['efficiency'], alpha=0.4, linewidth=0.5)
axes[0].axhline(0.105, color='green', linestyle='--', label='η target')
axes[0].set_title('Efficiency per Trial')
axes[0].legend()

# Histogram
axes[1].hist(df['efficiency'], bins=50, color='steelblue', edgecolor='none')
axes[1].axvline(0.105, color='green', linestyle='--')
axes[1].set_title('Efficiency Distribution')

# Steps to converge
axes[2].scatter(df['efficiency'], df['steps'], alpha=0.2, s=2)
axes[2].set_title('Efficiency vs Steps to Converge')

plt.tight_layout()
plt.show()
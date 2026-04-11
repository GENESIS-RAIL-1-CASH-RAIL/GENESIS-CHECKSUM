// ══════════════════════════════════════════════════════════════════════════
// EdgeDecayDetectorService — Weapon Edge Crowding Detection
// Spark #055 EvoForge Meta-Swarm — Detects when competitors reverse-engineer our edge
// Monitors per-weapon shadow PnL trends; alerts on statistically significant decline
// ══════════════════════════════════════════════════════════════════════════

export interface WeaponPnLSample {
  weaponId: string;
  pnl: number;
  marketCondition: string; // "bullish" | "bearish" | "ranging"
  timestamp: number;
}

export interface EdgeDecayAlert {
  weaponId: string;
  decayDetected: boolean;
  slopePercentPerDay: number;
  rSquared: number;
  samplesUsed: number;
  lastAlertAt: number | null;
  status: "healthy" | "warning" | "critical";
}

export class EdgeDecayDetectorService {
  // Rolling window of PnL samples per weapon
  private pnlHistory: Map<string, WeaponPnLSample[]> = new Map();
  private lastAlertTs: Map<string, number> = new Map();

  // Thresholds
  private readonly windowSize: number = 100; // samples
  private readonly slopeThreshold: number = -0.01; // -1% per day triggers alert
  private readonly rSquaredThreshold: number = 0.5; // must be genuine trend (R² > 0.5)
  private readonly alertCooldown: number = 60 * 60 * 1000; // 1 hour between alerts

  constructor(
    windowSize: number = 100,
    slopeThreshold: number = -0.01,
    rSquaredThreshold: number = 0.5
  ) {
    this.windowSize = windowSize;
    this.slopeThreshold = slopeThreshold;
    this.rSquaredThreshold = rSquaredThreshold;
  }

  /**
   * Record a new PnL sample for a weapon
   */
  recordPnL(sample: WeaponPnLSample): void {
    if (!this.pnlHistory.has(sample.weaponId)) {
      this.pnlHistory.set(sample.weaponId, []);
    }

    const history = this.pnlHistory.get(sample.weaponId)!;
    history.push(sample);

    // Keep only recent samples (rolling window)
    if (history.length > this.windowSize * 2) {
      history.splice(0, history.length - this.windowSize);
    }
  }

  /**
   * Check for edge decay on a weapon
   */
  checkWeapon(weaponId: string): EdgeDecayAlert {
    const history = this.pnlHistory.get(weaponId) ?? [];
    const lastAlert = this.lastAlertTs.get(weaponId) ?? 0;
    const now = Date.now();

    const alert: EdgeDecayAlert = {
      weaponId,
      decayDetected: false,
      slopePercentPerDay: 0,
      rSquared: 0,
      samplesUsed: 0,
      lastAlertAt: lastAlert > 0 ? lastAlert : null,
      status: "healthy",
    };

    // Need at least windowSize samples
    if (history.length < Math.max(50, this.windowSize / 2)) {
      return alert;
    }

    // Use last windowSize samples
    const window = history.slice(-this.windowSize);

    // Linear regression: time vs PnL
    const { slope, intercept, rSquared } = this.linearRegression(window);

    // Normalize slope to per-day (assuming tick-based time)
    // Rough heuristic: 1000 samples ≈ 1 trading day
    const slopePerDay = slope * 1000;

    alert.slopePercentPerDay = slopePerDay * 100; // as percentage
    alert.rSquared = rSquared;
    alert.samplesUsed = window.length;

    // Detect edge decay: slope < threshold AND R² > threshold
    const isDecaying = slope < this.slopeThreshold && rSquared > this.rSquaredThreshold;

    if (isDecaying && now - lastAlert > this.alertCooldown) {
      alert.decayDetected = true;
      this.lastAlertTs.set(weaponId, now);

      // Status levels
      if (slope < this.slopeThreshold * 3) {
        alert.status = "critical"; // Sharp decline
      } else if (slope < this.slopeThreshold * 1.5) {
        alert.status = "warning"; // Moderate decline
      }
    }

    return alert;
  }

  /**
   * Check all tracked weapons
   */
  checkAllWeapons(): EdgeDecayAlert[] {
    return Array.from(this.pnlHistory.keys()).map(weaponId => this.checkWeapon(weaponId));
  }

  /**
   * Linear regression: y = mx + b
   * Returns slope, intercept, and R²
   */
  private linearRegression(
    samples: WeaponPnLSample[]
  ): { slope: number; intercept: number; rSquared: number } {
    const n = samples.length;
    if (n < 2) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    // x = index (0, 1, 2, ...)
    // y = pnl
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0,
      sumY2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = samples[i].pnl;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = meanY - slope * meanX;

    // R² = 1 - (SS_res / SS_tot)
    let ssRes = 0,
      ssTot = 0;
    for (let i = 0; i < n; i++) {
      const yPred = slope * i + intercept;
      const yActual = samples[i].pnl;
      ssRes += (yActual - yPred) * (yActual - yPred);
      ssTot += (yActual - meanY) * (yActual - meanY);
    }

    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, rSquared };
  }

  /**
   * Purge history for a weapon (e.g., on Labs REVIEW)
   */
  purgeWeapon(weaponId: string): void {
    this.pnlHistory.delete(weaponId);
    this.lastAlertTs.delete(weaponId);
  }

  /**
   * Get all tracked weapons
   */
  getTrackedWeapons(): string[] {
    return Array.from(this.pnlHistory.keys());
  }

  /**
   * Get history length for a weapon
   */
  getHistoryLength(weaponId: string): number {
    return this.pnlHistory.get(weaponId)?.length ?? 0;
  }

  /**
   * Set thresholds (for tuning)
   */
  setThresholds(
    slopeThreshold?: number,
    rSquaredThreshold?: number,
    windowSize?: number
  ): void {
    if (slopeThreshold !== undefined) {
      this.slopeThreshold = slopeThreshold;
    }
    if (rSquaredThreshold !== undefined) {
      this.rSquaredThreshold = rSquaredThreshold;
    }
    if (windowSize !== undefined) {
      this.windowSize = windowSize;
    }
  }

  /**
   * Get comprehensive status report
   */
  getStatusReport(): {
    totalWeaponsTracked: number;
    weaponsInCritical: string[];
    weaponsInWarning: string[];
    averageEdgeHealthPercent: number;
  } {
    const alerts = this.checkAllWeapons();
    const critical = alerts.filter(a => a.status === "critical").map(a => a.weaponId);
    const warning = alerts.filter(a => a.status === "warning").map(a => a.weaponId);

    // Average slope (higher = healthier)
    const avgSlope =
      alerts.length > 0 ? alerts.reduce((s, a) => s + a.slopePercentPerDay, 0) / alerts.length : 0;

    return {
      totalWeaponsTracked: alerts.length,
      weaponsInCritical: critical,
      weaponsInWarning: warning,
      averageEdgeHealthPercent: 100 + avgSlope * 100, // Invert: higher is healthier
    };
  }
}

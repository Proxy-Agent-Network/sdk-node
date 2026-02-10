/**
 * Proxy Protocol Reward Calculator (v1)
 *
 * This utility helps Agents calculate the appropriate tip amount (Keysend)
 * based on Human Node performance metrics defined in REWARD_TYPES.md.
 *
 * Usage:
 * import { calculateRewards } from './reward_calculator';
 * const tip = calculateRewards(taskResult, baseFee);
 */

interface TaskResult {
  actualDurationMinutes: number;
  slaDurationMinutes: number;
  intuitionOverride: boolean;
  qualityScore: number; // 1-10 (AI Evaluated)
}

interface RewardConfig {
  speedRatePerMinute: number; // Sats per minute saved
  intuitionMultiplier: number; // % of base fee (e.g., 0.20 for 20%)
  qualityMultiplier: number;   // Sats per quality point > 5
  maxTipAllowance: number;     // Hard cap in Sats
}

// Default Configuration based on docs/economics/REWARD_TYPES.md
const DEFAULT_CONFIG: RewardConfig = {
  speedRatePerMinute: 10,
  intuitionMultiplier: 0.20,
  qualityMultiplier: 20,
  maxTipAllowance: 5000
};

export function calculateRewards(
  result: TaskResult,
  baseFeeSats: number,
  config: RewardConfig = DEFAULT_CONFIG
): { totalTip: number; breakdown: Record<string, number> } {

  let totalTip = 0;
  const breakdown: Record<string, number> = {};

  // 1. Calculate Speed Bonus (RWD_SPEED)
  // Formula: (SLA_Time - Actual_Time) * Rate_Per_Minute
  if (result.actualDurationMinutes < result.slaDurationMinutes) {
    const timeSaved = result.slaDurationMinutes - result.actualDurationMinutes;
    const speedBonus = Math.floor(timeSaved * config.speedRatePerMinute);
    if (speedBonus > 0) {
      breakdown['RWD_SPEED'] = speedBonus;
      totalTip += speedBonus;
    }
  }

  // 2. Calculate Intuition Bonus (RWD_INTUITION)
  // Formula: Base_Fee * Intuition_Multiplier
  // Logic: Rewarding the human for deviating from instructions to save the mission.
  if (result.intuitionOverride) {
    const intuitionBonus = Math.floor(baseFeeSats * config.intuitionMultiplier);
    breakdown['RWD_INTUITION'] = intuitionBonus;
    totalTip += intuitionBonus;
  }

  // 3. Calculate Quality Bonus (RWD_QUALITY)
  // Formula: (Score - 5) * Multiplier (Only for scores > 5)
  if (result.qualityScore > 5) {
    const qualityBonus = Math.floor((result.qualityScore - 5) * config.qualityMultiplier);
    breakdown['RWD_QUALITY'] = qualityBonus;
    totalTip += qualityBonus;
  }

  // 4. Budget Safety Check
  // Hard Cap: The protocol rejects tips exceeding 100% of Base Fee by default.
  // We strictly enforce the maxTipAllowance here.
  const safetyCap = Math.min(config.maxTipAllowance, baseFeeSats);

  if (totalTip > safetyCap) {
    console.warn(`[RewardCalculator] Tip capped! Calculated: ${totalTip}, Cap: ${safetyCap}`);
    totalTip = safetyCap;
    // Note: In a real implementation, you might reduce proportional to weight
    breakdown['BUDGET_CAP_ENFORCED'] = -1 * (totalTip - safetyCap); 
    totalTip = safetyCap;
  }

  return { totalTip, breakdown };
}

// --- Example Usage (Run with `ts-node reward_calculator.ts`) ---
if (require.main === module) {
  const baseFee = 5000; // 5,000 Sats (~$5.00)

  // Scene: A courier task that was finished early, required intuition, and had great photo proof.
  const sampleResult: TaskResult = {
    actualDurationMinutes: 45,
    slaDurationMinutes: 60, // Saved 15 minutes
    intuitionOverride: true, // Human acted smart
    qualityScore: 9          // Great photo
  };

  console.log(`[*] Base Fee: ${baseFee} Sats`);
  console.log(`[*] Task Result:`, sampleResult);

  const rewards = calculateRewards(sampleResult, baseFee);

  console.log(`\n[+] Calculated Tip Payload:`);
  console.log(JSON.stringify(rewards, null, 2));

  console.log(`\n[>] Simulated Lightning Keysend...`);
  console.log(`    Amount: ${rewards.totalTip} Sats`);
  // This metadata matches the spec in REWARD_TYPES.md
  console.log(`    Custom Record 696969: "RWD_INTUITION,RWD_SPEED,RWD_QUALITY"`);
}

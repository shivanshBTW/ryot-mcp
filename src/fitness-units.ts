/**
 * Ryot fitness duration units — read this before logging workouts.
 *
 * Agents often confuse these two fields:
 * - set statistic duration  → MINUTES (what the UI shows per exercise)
 * - workout-level duration  → SECONDS (total elapsed workout time)
 */

export const RYOT_FITNESS_DURATION_UNITS = {
  warning:
    "Do NOT multiply set duration by 60. A 5-minute walk uses statistic.duration = 5, not 300.",
  fields: {
    "exercises[].sets[].statistic.duration": {
      unit: "minutes",
      examples: {
        "5-minute walk": 5,
        "20-minute walk": 20,
        wrong: "300 for a 5-minute walk (that means 300 minutes in Ryot)",
      },
    },
    "workout.duration": {
      unit: "seconds",
      examples: {
        "7-minute workout": 420,
        "5-minute workout": 300,
      },
    },
    "exercises[].sets[].restTime": {
      unit: "seconds",
      examples: {
        "90-second rest": 90,
      },
    },
    "walkingMinutes / minutes tool args": {
      unit: "minutes",
      note: "Human-facing args; MCP helpers convert to the correct Ryot field.",
    },
  },
} as const;

/** Per-set exercise duration sent to Ryot — always minutes, never seconds. */
export function setDurationMinutes(minutes: number): number {
  return minutes;
}

/** Total workout duration on UserWorkoutInput — always seconds. */
export function workoutDurationSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

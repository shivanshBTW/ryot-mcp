import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asText, isoMinutesFrom, nowIso, resolveRequiredId } from "./common.js";
import { setDurationMinutes, workoutDurationSeconds } from "./fitness-units.js";
import { ryotGraphql, ryotRootOperation } from "./ryot.js";
import {
  DateTimeString,
  DecimalLike,
  ExerciseListFilter,
  ExerciseSortBy,
  SortOrder,
  WorkoutInput,
  WorkoutsListSortBy,
} from "./schemas.js";

/** Build a duration-based set. statistic.duration is MINUTES — do not pass seconds. */
function durationSet(minutes: number, note?: string) {
  return {
    lot: "NORMAL",
    statistic: { duration: setDurationMinutes(minutes) },
    confirmedAt: nowIso(),
    ...(note ? { note } : {}),
  };
}

function repsSet(reps: number, note?: string) {
  return {
    lot: "NORMAL",
    statistic: { reps },
    confirmedAt: nowIso(),
    ...(note ? { note } : {}),
  };
}

function workoutExercise(
  exerciseId: string,
  sets: unknown[],
  notes: string[] = [],
  unitSystem: "METRIC" | "IMPERIAL" = "METRIC",
) {
  return { exerciseId, unitSystem, sets, notes };
}

export function registerWorkoutTools(server: McpServer) {
  server.registerTool(
    "ryot_log_workout",
    {
      title: "Log workout",
      description:
        "Create or update a completed Ryot workout. Requires Ryot exercise IDs, not exercise names. DURATION UNITS: exercises[].sets[].statistic.duration = MINUTES (5-min walk → 5, not 300). workout.duration = SECONDS (7-min workout → 420).",
      inputSchema: { workout: WorkoutInput },
    },
    async ({ workout }) =>
      asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkout($input: UserWorkoutInput!) { createOrUpdateUserWorkout(input: $input) }`,
          { input: workout },
        ),
      ),
  );

  server.registerTool(
    "ryot_create_workout_template",
    {
      title: "Create workout template",
      description:
        "Create or update a Ryot workout template/routine. Requires Ryot exercise IDs. DURATION UNITS: set statistic.duration = MINUTES; workout.duration = SECONDS.",
      inputSchema: { template: WorkoutInput },
    },
    async ({ template }) =>
      asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkoutTemplate($input: UserWorkoutInput!) { createOrUpdateUserWorkoutTemplate(input: $input) }`,
          { input: template },
        ),
      ),
  );

  server.registerTool(
    "ryot_log_body_measurement",
    {
      title: "Log body measurement",
      description:
        "Log weight/body measurements in Ryot. Use statistic names like weight, waist, body_fat, chest, etc.",
      inputSchema: {
        timestamp: DateTimeString,
        statistics: z
          .array(z.object({ name: z.string(), value: DecimalLike }))
          .min(1),
        name: z.string().optional(),
        comment: z.string().optional(),
      },
    },
    async ({ timestamp, statistics, name, comment }) =>
      asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserMeasurement($input: UserMeasurementInput!) { createOrUpdateUserMeasurement(input: $input) }`,
          {
            input: {
              timestamp,
              name,
              comment,
              information: { statistics, assets: {} },
            },
          },
        ),
      ),
  );

  server.registerTool(
    "ryot_search_exercises",
    {
      title: "Search exercises",
      description:
        "Search Ryot exercises. Returns Ryot's cached exercise ID response; use exercise IDs for workout logging/templates.",
      inputSchema: {
        query: z.string().optional(),
        page: z.number().int().min(1).optional(),
        take: z.number().int().min(1).max(100).optional(),
        sortBy: ExerciseSortBy.optional(),
        filter: ExerciseListFilter.optional(),
      },
    },
    async ({ query, page, take, sortBy, filter }) => {
      const input: Record<string, unknown> = {};
      if (query !== undefined || page !== undefined || take !== undefined)
        input.search = { query, page, take };
      if (sortBy !== undefined) input.sortBy = sortBy;
      if (filter !== undefined) input.filter = filter;
      return asText(
        await ryotRootOperation("query", "userExercisesList", { input }, 2),
      );
    },
  );

  server.registerTool(
    "ryot_list_recent_workouts",
    {
      title: "List recent workouts",
      description:
        "List/search the user's logged workouts. Returns Ryot's cached workout ID response.",
      inputSchema: {
        query: z.string().optional(),
        page: z.number().int().min(1).optional(),
        take: z.number().int().min(1).max(100).default(10),
        sortBy: WorkoutsListSortBy.default("TIME"),
        order: SortOrder.default("DESC"),
      },
    },
    async ({ query, page, take, sortBy, order }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userWorkoutsList",
          {
            input: {
              search: { query, page, take },
              sort: { by: sortBy, order },
            },
          },
          2,
        ),
      ),
  );

  server.registerTool(
    "ryot_list_workout_templates",
    {
      title: "List workout templates",
      description:
        "List/search Ryot workout templates/routines. Returns Ryot's cached template ID response.",
      inputSchema: {
        query: z.string().optional(),
        page: z.number().int().min(1).optional(),
        take: z.number().int().min(1).max(100).default(10),
        sortBy: WorkoutsListSortBy.default("TIME"),
        order: SortOrder.default("DESC"),
      },
    },
    async ({ query, page, take, sortBy, order }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userWorkoutTemplatesList",
          {
            input: {
              search: { query, page, take },
              sort: { by: sortBy, order },
            },
          },
          2,
        ),
      ),
  );

  server.registerTool(
    "ryot_get_workout_details",
    {
      title: "Get workout details",
      description: "Get full details for a logged workout by workoutId.",
      inputSchema: { workoutId: z.string() },
    },
    async ({ workoutId }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userWorkoutDetails",
          { workoutId },
          3,
        ),
      ),
  );

  server.registerTool(
    "ryot_get_workout_template_details",
    {
      title: "Get workout template details",
      description:
        "Get full details for a workout template/routine by workoutTemplateId.",
      inputSchema: { workoutTemplateId: z.string() },
    },
    async ({ workoutTemplateId }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userWorkoutTemplateDetails",
          { workoutTemplateId },
          3,
        ),
      ),
  );

  server.registerTool(
    "ryot_log_walk",
    {
      title: "Log walk",
      description:
        "Log a simple walking workout. Uses walkingExerciseId or RYOT_WALKING_EXERCISE_ID. The minutes arg is human minutes; set statistic.duration is stored as minutes (5 → 5), workout.duration as seconds (5 → 300).",
      inputSchema: {
        walkingExerciseId: z
          .string()
          .optional()
          .describe(
            "Ryot exercise ID for Walking. If omitted, RYOT_WALKING_EXERCISE_ID is used.",
          ),
        minutes: z
          .number()
          .min(1)
          .max(240)
          .default(5)
          .describe("Walk length in minutes (not seconds)."),
        startTime: DateTimeString.optional().describe(
          "Defaults to now minus the walking duration.",
        ),
        comment: z.string().optional().default("Logged from Ryot MCP"),
      },
    },
    async ({ walkingExerciseId, minutes, startTime, comment }) => {
      const exerciseId = resolveRequiredId(
        walkingExerciseId,
        "RYOT_WALKING_EXERCISE_ID",
        "walkingExerciseId",
      );
      const end = new Date();
      const start =
        startTime ?? new Date(end.getTime() - minutes * 60_000).toISOString();
      const workout = {
        name: `${minutes} min walk`,
        startTime: start,
        endTime: end.toISOString(),
        duration: workoutDurationSeconds(minutes),
        exercises: [
          workoutExercise(
            exerciseId,
            [durationSet(minutes, "Easy walking")],
            ["Low-friction walking log"],
          ),
        ],
        supersets: [],
        comment,
      };
      return asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkout($input: UserWorkoutInput!) { createOrUpdateUserWorkout(input: $input) }`,
          { input: workout },
        ),
      );
    },
  );

  server.registerTool(
    "ryot_log_bodyweight_set",
    {
      title: "Log bodyweight set",
      description:
        "Log a simple bodyweight exercise workout, such as wall push-ups, squats, or chair sit-to-stands. Requires a Ryot exercise ID.",
      inputSchema: {
        exerciseId: z
          .string()
          .describe("Ryot exercise ID for the bodyweight exercise."),
        exerciseName: z
          .string()
          .optional()
          .describe("Human readable name used for the workout title."),
        reps: z.number().int().min(1).max(500).default(5),
        setCount: z.number().int().min(1).max(20).default(1),
        startTime: DateTimeString.optional().describe("Defaults to now."),
        comment: z.string().optional().default("Logged from Ryot MCP"),
      },
    },
    async ({
      exerciseId,
      exerciseName,
      reps,
      setCount,
      startTime,
      comment,
    }) => {
      const start = startTime ?? nowIso();
      const end = isoMinutesFrom(new Date(start), Math.max(1, setCount));
      const sets = Array.from({ length: setCount }, (_, i) =>
        repsSet(reps, setCount > 1 ? `Set ${i + 1}` : undefined),
      );
      const workout = {
        name: exerciseName
          ? `${exerciseName}: ${setCount}x${reps}`
          : `Bodyweight: ${setCount}x${reps}`,
        startTime: start,
        endTime: end,
        duration: workoutDurationSeconds(Math.max(1, setCount)),
        exercises: [
          workoutExercise(exerciseId, sets, exerciseName ? [exerciseName] : []),
        ],
        supersets: [],
        comment,
      };
      return asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkout($input: UserWorkoutInput!) { createOrUpdateUserWorkout(input: $input) }`,
          { input: workout },
        ),
      );
    },
  );

  server.registerTool(
    "ryot_log_minimum_workout",
    {
      title: "Log minimum workout",
      description:
        "Log the default minimum workout: walking + chair sit-to-stand + wall push-up. Exercise IDs can be passed or set via env vars. Set statistic.duration = MINUTES; workout.duration = SECONDS.",
      inputSchema: {
        walkingExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALKING_EXERCISE_ID."),
        sitToStandExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_SIT_TO_STAND_EXERCISE_ID."),
        wallPushupExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALL_PUSHUP_EXERCISE_ID."),
        walkingMinutes: z
          .number()
          .min(1)
          .max(60)
          .default(5)
          .describe("Walk length in minutes (not seconds). Set duration uses minutes; workout.duration uses seconds."),
        sitToStandReps: z.number().int().min(1).max(100).default(5),
        wallPushupReps: z.number().int().min(1).max(100).default(5),
        startTime: DateTimeString.optional().describe(
          "Defaults to now minus estimated duration.",
        ),
        comment: z
          .string()
          .optional()
          .default("Minimum workout done. Keeping the streak alive."),
      },
    },
    async (args) => {
      const walkingId = resolveRequiredId(
        args.walkingExerciseId,
        "RYOT_WALKING_EXERCISE_ID",
        "walkingExerciseId",
      );
      const sitToStandId = resolveRequiredId(
        args.sitToStandExerciseId,
        "RYOT_SIT_TO_STAND_EXERCISE_ID",
        "sitToStandExerciseId",
      );
      const wallPushupId = resolveRequiredId(
        args.wallPushupExerciseId,
        "RYOT_WALL_PUSHUP_EXERCISE_ID",
        "wallPushupExerciseId",
      );
      const totalMinutes = args.walkingMinutes + 2;
      const end = new Date();
      const start =
        args.startTime ??
        new Date(end.getTime() - totalMinutes * 60_000).toISOString();
      const workout = {
        name: "Minimum Day",
        startTime: start,
        endTime: end.toISOString(),
        duration: workoutDurationSeconds(totalMinutes),
        exercises: [
          workoutExercise(
            walkingId,
            [durationSet(args.walkingMinutes, "Minimum walk")],
            ["Walking"],
          ),
          workoutExercise(
            sitToStandId,
            [repsSet(args.sitToStandReps, "Minimum strength")],
            ["Chair sit-to-stand"],
          ),
          workoutExercise(
            wallPushupId,
            [repsSet(args.wallPushupReps, "Minimum strength")],
            ["Wall push-up"],
          ),
        ],
        supersets: [],
        comment: args.comment,
      };
      return asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkout($input: UserWorkoutInput!) { createOrUpdateUserWorkout(input: $input) }`,
          { input: workout },
        ),
      );
    },
  );

  server.registerTool(
    "ryot_create_minimum_routine_template",
    {
      title: "Create minimum routine template",
      description:
        "Create a reusable Minimum Day routine/template in Ryot. Exercise IDs can be passed or set via env vars.",
      inputSchema: {
        walkingExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALKING_EXERCISE_ID."),
        sitToStandExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_SIT_TO_STAND_EXERCISE_ID."),
        wallPushupExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALL_PUSHUP_EXERCISE_ID."),
        walkingMinutes: z
          .number()
          .min(1)
          .max(60)
          .default(5)
          .describe("Walk length in minutes (not seconds). Set duration uses minutes; workout.duration uses seconds."),
        sitToStandReps: z.number().int().min(1).max(100).default(5),
        wallPushupReps: z.number().int().min(1).max(100).default(5),
        templateName: z.string().default("Minimum Day"),
      },
    },
    async (args) => {
      const walkingId = resolveRequiredId(
        args.walkingExerciseId,
        "RYOT_WALKING_EXERCISE_ID",
        "walkingExerciseId",
      );
      const sitToStandId = resolveRequiredId(
        args.sitToStandExerciseId,
        "RYOT_SIT_TO_STAND_EXERCISE_ID",
        "sitToStandExerciseId",
      );
      const wallPushupId = resolveRequiredId(
        args.wallPushupExerciseId,
        "RYOT_WALL_PUSHUP_EXERCISE_ID",
        "wallPushupExerciseId",
      );
      const start = nowIso();
      const end = isoMinutesFrom(new Date(start), args.walkingMinutes + 2);
      const template = {
        name: args.templateName,
        startTime: start,
        endTime: end,
        duration: workoutDurationSeconds(args.walkingMinutes + 2),
        exercises: [
          workoutExercise(
            walkingId,
            [durationSet(args.walkingMinutes, "Minimum walk")],
            ["Walking"],
          ),
          workoutExercise(
            sitToStandId,
            [repsSet(args.sitToStandReps, "Minimum strength")],
            ["Chair sit-to-stand"],
          ),
          workoutExercise(
            wallPushupId,
            [repsSet(args.wallPushupReps, "Minimum strength")],
            ["Wall push-up"],
          ),
        ],
        supersets: [],
        comment: "Minimum viable routine for low-motivation days.",
      };
      return asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkoutTemplate($input: UserWorkoutInput!) { createOrUpdateUserWorkoutTemplate(input: $input) }`,
          { input: template },
        ),
      );
    },
  );

  server.registerTool(
    "ryot_start_today_routine",
    {
      title: "Start today's routine",
      description:
        "Practical start/log shortcut for today. Since Ryot stores completed workout logs, this logs the minimum routine for today, optionally linked to a templateId.",
      inputSchema: {
        templateId: z
          .string()
          .optional()
          .describe(
            "Optional Ryot workout template ID to link via templateId.",
          ),
        walkingExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALKING_EXERCISE_ID."),
        sitToStandExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_SIT_TO_STAND_EXERCISE_ID."),
        wallPushupExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALL_PUSHUP_EXERCISE_ID."),
        walkingMinutes: z
          .number()
          .min(1)
          .max(60)
          .default(5)
          .describe("Walk length in minutes (not seconds). Set duration uses minutes; workout.duration uses seconds."),
        sitToStandReps: z.number().int().min(1).max(100).default(5),
        wallPushupReps: z.number().int().min(1).max(100).default(5),
        comment: z
          .string()
          .optional()
          .default("Started/completed today's minimum routine from MCP."),
      },
    },
    async (args) => {
      const walkingId = resolveRequiredId(
        args.walkingExerciseId,
        "RYOT_WALKING_EXERCISE_ID",
        "walkingExerciseId",
      );
      const sitToStandId = resolveRequiredId(
        args.sitToStandExerciseId,
        "RYOT_SIT_TO_STAND_EXERCISE_ID",
        "sitToStandExerciseId",
      );
      const wallPushupId = resolveRequiredId(
        args.wallPushupExerciseId,
        "RYOT_WALL_PUSHUP_EXERCISE_ID",
        "wallPushupExerciseId",
      );
      const end = new Date();
      const start = new Date(
        end.getTime() - (args.walkingMinutes + 2) * 60_000,
      ).toISOString();
      const workout = {
        name: "Today's Minimum Routine",
        startTime: start,
        endTime: end.toISOString(),
        duration: workoutDurationSeconds(args.walkingMinutes + 2),
        templateId: args.templateId,
        exercises: [
          workoutExercise(
            walkingId,
            [durationSet(args.walkingMinutes, "Minimum walk")],
            ["Walking"],
          ),
          workoutExercise(
            sitToStandId,
            [repsSet(args.sitToStandReps, "Minimum strength")],
            ["Chair sit-to-stand"],
          ),
          workoutExercise(
            wallPushupId,
            [repsSet(args.wallPushupReps, "Minimum strength")],
            ["Wall push-up"],
          ),
        ],
        supersets: [],
        comment: args.comment,
      };
      return asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkout($input: UserWorkoutInput!) { createOrUpdateUserWorkout(input: $input) }`,
          { input: workout },
        ),
      );
    },
  );

  server.registerTool(
    "ryot_log_weight",
    {
      title: "Log weight",
      description: "Convenience tool to log body weight as a Ryot measurement.",
      inputSchema: {
        value: DecimalLike,
        timestamp: DateTimeString.optional(),
        name: z.string().default("Weight"),
        comment: z.string().optional(),
      },
    },
    async ({ value, timestamp, name, comment }) =>
      asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserMeasurement($input: UserMeasurementInput!) { createOrUpdateUserMeasurement(input: $input) }`,
          {
            input: {
              timestamp: timestamp ?? nowIso(),
              name,
              comment,
              information: {
                statistics: [{ name: "weight", value }],
                assets: {},
              },
            },
          },
        ),
      ),
  );

  server.registerTool(
    "ryot_log_waist",
    {
      title: "Log waist",
      description:
        "Convenience tool to log waist measurement as a Ryot measurement.",
      inputSchema: {
        value: DecimalLike,
        timestamp: DateTimeString.optional(),
        name: z.string().default("Waist"),
        comment: z.string().optional(),
      },
    },
    async ({ value, timestamp, name, comment }) =>
      asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserMeasurement($input: UserMeasurementInput!) { createOrUpdateUserMeasurement(input: $input) }`,
          {
            input: {
              timestamp: timestamp ?? nowIso(),
              name,
              comment,
              information: {
                statistics: [{ name: "waist", value }],
                assets: {},
              },
            },
          },
        ),
      ),
  );

  server.registerTool(
    "ryot_list_measurements",
    {
      title: "List measurements",
      description:
        "List Ryot body measurements, optionally filtered by start/end time.",
      inputSchema: {
        startTime: DateTimeString.optional(),
        endTime: DateTimeString.optional(),
      },
    },
    async ({ startTime, endTime }) => {
      const input: Record<string, unknown> = {};
      if (startTime !== undefined) input.startTime = startTime;
      if (endTime !== undefined) input.endTime = endTime;
      return asText(
        await ryotRootOperation("query", "userMeasurementsList", { input }, 3),
      );
    },
  );

  server.registerTool(
    "ryot_log_minimum_day",
    {
      title: "Log minimum day",
      description:
        "Alias for the Minimum Day routine: log the smallest acceptable workout without guilt. Set statistic.duration = MINUTES; workout.duration = SECONDS.",
      inputSchema: {
        walkingExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALKING_EXERCISE_ID."),
        sitToStandExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_SIT_TO_STAND_EXERCISE_ID."),
        wallPushupExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALL_PUSHUP_EXERCISE_ID."),
        walkingMinutes: z
          .number()
          .min(1)
          .max(60)
          .default(5)
          .describe("Walk length in minutes (not seconds). Set duration uses minutes; workout.duration uses seconds."),
        comment: z
          .string()
          .optional()
          .default("Minimum day completed. No zero day."),
      },
    },
    async (args) => {
      const walkingId = resolveRequiredId(
        args.walkingExerciseId,
        "RYOT_WALKING_EXERCISE_ID",
        "walkingExerciseId",
      );
      const sitToStandId = resolveRequiredId(
        args.sitToStandExerciseId,
        "RYOT_SIT_TO_STAND_EXERCISE_ID",
        "sitToStandExerciseId",
      );
      const wallPushupId = resolveRequiredId(
        args.wallPushupExerciseId,
        "RYOT_WALL_PUSHUP_EXERCISE_ID",
        "wallPushupExerciseId",
      );
      const end = new Date();
      const start = new Date(
        end.getTime() - (args.walkingMinutes + 2) * 60_000,
      ).toISOString();
      const workout = {
        name: "Minimum Day",
        startTime: start,
        endTime: end.toISOString(),
        duration: workoutDurationSeconds(args.walkingMinutes + 2),
        exercises: [
          workoutExercise(
            walkingId,
            [durationSet(args.walkingMinutes, "Minimum walk")],
            ["Walking"],
          ),
          workoutExercise(
            sitToStandId,
            [repsSet(5, "Minimum strength")],
            ["Chair sit-to-stand"],
          ),
          workoutExercise(
            wallPushupId,
            [repsSet(5, "Minimum strength")],
            ["Wall push-up"],
          ),
        ],
        supersets: [],
        comment: args.comment,
      };
      return asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkout($input: UserWorkoutInput!) { createOrUpdateUserWorkout(input: $input) }`,
          { input: workout },
        ),
      );
    },
  );

  server.registerTool(
    "ryot_log_recovery_day",
    {
      title: "Log recovery day",
      description:
        "Log a very easy recovery day, usually just a short walk, for habit continuity.",
      inputSchema: {
        walkingExerciseId: z
          .string()
          .optional()
          .describe("Defaults to RYOT_WALKING_EXERCISE_ID."),
        minutes: z
          .number()
          .min(1)
          .max(120)
          .default(5)
          .describe("Walk length in minutes (not seconds)."),
        comment: z
          .string()
          .optional()
          .default("Recovery day. Easy movement only."),
      },
    },
    async ({ walkingExerciseId, minutes, comment }) => {
      const exerciseId = resolveRequiredId(
        walkingExerciseId,
        "RYOT_WALKING_EXERCISE_ID",
        "walkingExerciseId",
      );
      const end = new Date();
      const start = new Date(end.getTime() - minutes * 60_000).toISOString();
      const workout = {
        name: "Recovery Day",
        startTime: start,
        endTime: end.toISOString(),
        duration: workoutDurationSeconds(minutes),
        exercises: [
          workoutExercise(
            exerciseId,
            [durationSet(minutes, "Easy recovery walk")],
            ["Recovery walk"],
          ),
        ],
        supersets: [],
        comment,
      };
      return asText(
        await ryotGraphql(
          `mutation CreateOrUpdateUserWorkout($input: UserWorkoutInput!) { createOrUpdateUserWorkout(input: $input) }`,
          { input: workout },
        ),
      );
    },
  );

  server.registerTool(
    "ryot_get_weekly_workout_summary",
    {
      title: "Weekly workout summary",
      description:
        "Fetch recent workouts and measurements for a lightweight weekly fitness summary. The client can summarize the returned data.",
      inputSchema: { take: z.number().int().min(1).max(100).default(20) },
    },
    async ({ take }) => {
      const workouts = await ryotRootOperation(
        "query",
        "userWorkoutsList",
        { input: { search: { take }, sort: { by: "TIME", order: "DESC" } } },
        3,
      );
      const measurements = await ryotRootOperation(
        "query",
        "userMeasurementsList",
        { input: {} },
        3,
      );
      return asText({ workouts, measurements });
    },
  );
}

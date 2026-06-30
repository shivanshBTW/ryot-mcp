import { z } from "zod";

export const DateTimeString = z
  .string()
  .describe("ISO datetime string, for example 2026-06-30T09:00:00+05:30");
export const DecimalLike = z
  .union([z.number(), z.string()])
  .describe("Number/decimal accepted by Ryot GraphQL");

export const SetLot = z.enum(["NORMAL", "WARM_UP", "DROP", "FAILURE"]);
export const UnitSystem = z.enum(["METRIC", "IMPERIAL"]);
export const SeenState = z.enum([
  "IN_PROGRESS",
  "COMPLETED",
  "DROPPED",
  "ON_A_HOLD",
]);
export const MediaLot = z.enum([
  "BOOK",
  "SHOW",
  "MOVIE",
  "ANIME",
  "MANGA",
  "MUSIC",
  "PODCAST",
  "AUDIO_BOOK",
  "VIDEO_GAME",
  "COMIC_BOOK",
  "VISUAL_NOVEL",
]);
export const MediaSource = z.enum([
  "IGDB",
  "TMDB",
  "TVDB",
  "ANILIST",
  "AUDIBLE",
  "SPOTIFY",
  "GOOGLE_BOOKS",
  "OPENLIBRARY",
  "ITUNES",
  "LISTENNOTES",
  "MANGA_UPDATES",
  "MUSIC_BRAINZ",
  "GIANT_BOMB",
  "HARDCOVER",
  "METRON",
  "MYANIMELIST",
  "YOUTUBE_MUSIC",
  "VNDB",
  "CUSTOM",
]);
export const EntityLot = z.enum([
  "METADATA",
  "PERSON",
  "EXERCISE",
  "WORKOUT",
  "WORKOUT_TEMPLATE",
  "METADATA_GROUP",
  "COLLECTION",
  "GENRE",
  "REVIEW",
  "USER_MEASUREMENT",
]);
export const ExerciseSortBy = z.enum([
  "NAME",
  "RANDOM",
  "LAST_PERFORMED",
  "TIMES_PERFORMED",
]);
export const WorkoutsListSortBy = z.enum(["TIME", "RANDOM"]);
export const SortOrder = z.enum(["ASC", "DESC"]);

export const ExerciseListFilter = z
  .object({
    types: z
      .array(z.string())
      .optional()
      .describe(
        "ExerciseLot enum values, for example Duration, DistanceAndDuration, Reps, RepsAndWeight",
      ),
    levels: z
      .array(z.string())
      .optional()
      .describe("ExerciseLevel enum values"),
    forces: z
      .array(z.string())
      .optional()
      .describe("ExerciseForce enum values"),
    muscles: z
      .array(z.string())
      .optional()
      .describe("ExerciseMuscle enum values"),
    mechanics: z
      .array(z.string())
      .optional()
      .describe("ExerciseMechanic enum values"),
    equipments: z
      .array(z.string())
      .optional()
      .describe("ExerciseEquipment enum values"),
  })
  .partial();

export const SetStatisticInput = z.object({
  reps: DecimalLike.optional(),
  weight: DecimalLike.optional(),
  duration: DecimalLike.optional().describe(
    "Duration in Ryot's expected base unit",
  ),
  distance: DecimalLike.optional().describe(
    "Distance in Ryot's expected base unit",
  ),
  oneRm: DecimalLike.optional(),
  volume: DecimalLike.optional(),
  pace: DecimalLike.optional(),
});

export const WorkoutSetInput = z.object({
  lot: SetLot.default("NORMAL"),
  statistic: SetStatisticInput,
  rpe: z.number().int().min(1).max(10).optional(),
  note: z.string().optional(),
  restTime: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Rest time in seconds"),
  confirmedAt: DateTimeString.optional(),
  restTimerStartedAt: DateTimeString.optional(),
});

export const WorkoutExerciseInput = z.object({
  exerciseId: z.string(),
  unitSystem: UnitSystem.default("METRIC"),
  sets: z.array(WorkoutSetInput).min(1),
  notes: z.array(z.string()).default([]),
});

export const WorkoutInput = z.object({
  name: z.string(),
  startTime: DateTimeString,
  endTime: DateTimeString,
  exercises: z.array(WorkoutExerciseInput).min(1),
  supersets: z
    .array(
      z.object({
        color: z.string(),
        exercises: z.array(z.number().int().nonnegative()),
      }),
    )
    .default([]),
  comment: z.string().optional(),
  duration: z.number().int().optional(),
  templateId: z.string().optional(),
  repeatedFrom: z.string().optional(),
  caloriesBurnt: DecimalLike.optional(),
  updateWorkoutId: z.string().optional(),
  updateWorkoutTemplateId: z.string().optional(),
});

export const ProgressCommonInput = {
  timestamp: DateTimeString.optional().describe("Defaults to current time."),
  startedOn: DateTimeString.optional().describe(
    "Optional start timestamp for completed entries.",
  ),
  manualTimeSpent: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Optional time spent, in Ryot's expected unit."),
  providersConsumedOn: z
    .array(z.string())
    .optional()
    .describe("Optional provider names/IDs if your Ryot instance uses them."),
};

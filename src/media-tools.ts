import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asText, nowIso, resolveOptionalDefault } from "./common.js";
import { ryotGraphql, ryotRootOperation } from "./ryot.js";
import {
  DateTimeString,
  DecimalLike,
  EntityLot,
  MediaLot,
  MediaSource,
  SeenState,
} from "./schemas.js";

const COMMON_COLLECTION_ENV = {
  movieWatchlist: "RYOT_MOVIE_WATCHLIST_COLLECTION",
  showWatchlist: "RYOT_SHOW_WATCHLIST_COLLECTION",
  gameBacklog: "RYOT_GAME_BACKLOG_COLLECTION",
} as const;

function creatorUserIdFrom(input?: string) {
  const creatorUserId = input || process.env.RYOT_USER_ID;
  if (!creatorUserId)
    throw new Error(
      "creatorUserId is required. Pass it in the tool input or set RYOT_USER_ID in the MCP env.",
    );
  return creatorUserId;
}

function commonProgressFields(args: Record<string, unknown>, keys: string[]) {
  const common: Record<string, unknown> = {};
  for (const key of keys) {
    if (args[key] !== undefined) common[key] = args[key];
  }
  return common;
}

async function deployProgress(
  metadataId: string,
  change: Record<string, unknown>,
) {
  return ryotGraphql(
    `mutation DeployBulkMetadataProgressUpdate($input: [MetadataProgressUpdateInput!]!) { deployBulkMetadataProgressUpdate(input: $input) }`,
    { input: [{ metadataId, change }] },
  );
}

async function addMetadataToCollection(
  creatorUserId: string,
  collectionName: string,
  metadataId: string,
  information?: unknown,
) {
  return ryotGraphql(
    `mutation DeployAddEntitiesToCollectionJob($input: ChangeCollectionToEntitiesInput!) { deployAddEntitiesToCollectionJob(input: $input) }`,
    {
      input: {
        creatorUserId,
        collectionName,
        entities: [
          { entityId: metadataId, entityLot: "METADATA", information },
        ],
      },
    },
  );
}

function mediaSearchInput(
  query: string,
  lot: string,
  source: string,
  page?: number,
) {
  return { lot, source, search: { query, page } };
}

function completedChange(
  timestamp: string,
  startedOn: string | undefined,
  common: Record<string, unknown>,
) {
  return startedOn
    ? {
        createNewCompleted: {
          startedAndFinishedOnDate: { startedOn, timestamp, ...common },
        },
      }
    : { createNewCompleted: { finishedOnDate: { timestamp, ...common } } };
}

export function registerMediaTools(server: McpServer) {
  server.registerTool(
    "ryot_search_media",
    {
      title: "Search media",
      description:
        "Search Ryot metadata for movies, shows, books, anime, manga, music, podcasts, games, etc. Returns Ryot's cached search response.",
      inputSchema: {
        query: z.string(),
        lot: MediaLot,
        source: MediaSource,
        page: z.number().int().min(1).optional(),
      },
    },
    async ({ query, lot, source, page }) =>
      asText(
        await ryotRootOperation(
          "query",
          "metadataSearch",
          { input: mediaSearchInput(query, lot, source, page) },
          2,
        ),
      ),
  );

  server.registerTool(
    "ryot_search_movie",
    {
      title: "Search movies",
      description: "Search movies in Ryot. Defaults to TMDB.",
      inputSchema: {
        query: z.string(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["TMDB", "CUSTOM"]).default("TMDB"),
      },
    },
    async ({ query, page, source }) =>
      asText(
        await ryotRootOperation(
          "query",
          "metadataSearch",
          { input: mediaSearchInput(query, "MOVIE", source, page) },
          2,
        ),
      ),
  );

  server.registerTool(
    "ryot_search_show",
    {
      title: "Search TV shows",
      description:
        "Search TV shows in Ryot. Defaults to TMDB; TVDB is also supported.",
      inputSchema: {
        query: z.string(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["TMDB", "TVDB", "CUSTOM"]).default("TMDB"),
      },
    },
    async ({ query, page, source }) =>
      asText(
        await ryotRootOperation(
          "query",
          "metadataSearch",
          { input: mediaSearchInput(query, "SHOW", source, page) },
          2,
        ),
      ),
  );

  server.registerTool(
    "ryot_search_game",
    {
      title: "Search video games",
      description: "Search video games in Ryot using IGDB by default.",
      inputSchema: {
        query: z.string(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["IGDB", "GIANT_BOMB", "CUSTOM"]).default("IGDB"),
        allowGamesWithParent: z.boolean().optional(),
      },
    },
    async ({ query, page, source, allowGamesWithParent }) => {
      const input: Record<string, unknown> = mediaSearchInput(
        query,
        "VIDEO_GAME",
        source,
        page,
      );
      if (source === "IGDB" && allowGamesWithParent !== undefined) {
        input.sourceSpecifics = { igdb: { filters: { allowGamesWithParent } } };
      }
      return asText(
        await ryotRootOperation("query", "metadataSearch", { input }, 2),
      );
    },
  );

  server.registerTool(
    "ryot_get_metadata_details",
    {
      title: "Get metadata details",
      description:
        "Get Ryot metadata details for a movie/show/book/game/etc by metadataId.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) =>
      asText(
        await ryotRootOperation("query", "metadataDetails", { metadataId }, 3),
      ),
  );

  server.registerTool(
    "ryot_get_user_metadata_details",
    {
      title: "Get user metadata details",
      description:
        "Get user-specific Ryot state for a metadata item: in-progress state, history, collections, reviews, and next episode/chapter when available.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userMetadataDetails",
          { metadataId },
          3,
        ),
      ),
  );

  server.registerTool(
    "ryot_get_movie_status",
    {
      title: "Get movie status",
      description:
        "Get your Ryot status/history/collections for a movie by metadataId.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userMetadataDetails",
          { metadataId },
          3,
        ),
      ),
  );

  server.registerTool(
    "ryot_get_show_status",
    {
      title: "Get show status",
      description:
        "Get your Ryot status, episode history, show progress, next entry, and collections for a show by metadataId.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userMetadataDetails",
          { metadataId },
          3,
        ),
      ),
  );

  server.registerTool(
    "ryot_get_game_status",
    {
      title: "Get game status",
      description:
        "Get your Ryot playing status/history/collections/reviews for a video game by metadataId.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userMetadataDetails",
          { metadataId },
          3,
        ),
      ),
  );

  server.registerTool(
    "ryot_mark_media_progress",
    {
      title: "Mark media/game progress",
      description:
        "Generic progress tool: start, complete, drop, hold, or update progress percent for any Ryot metadata item.",
      inputSchema: {
        metadataId: z.string(),
        action: z.enum(["start", "complete", "set_state", "set_percent"]),
        state: SeenState.optional().describe("Required for action=set_state"),
        percent: DecimalLike.optional().describe(
          "Required for action=set_percent, from 0 to 100",
        ),
        timestamp: DateTimeString.optional().describe(
          "Used for start/complete. Defaults to current time.",
        ),
        startedOn: DateTimeString.optional().describe(
          "Optional start time for complete with startedAndFinishedOnDate",
        ),
        manualTimeSpent: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Optional time spent, in Ryot's expected unit"),
        showSeasonNumber: z.number().int().optional(),
        showEpisodeNumber: z.number().int().optional(),
        animeEpisodeNumber: z.number().int().optional(),
        podcastEpisodeNumber: z.number().int().optional(),
        mangaChapterNumber: z.union([z.number(), z.string()]).optional(),
        mangaVolumeNumber: z.union([z.number(), z.string()]).optional(),
      },
    },
    async (args) => {
      const timestamp = args.timestamp ?? nowIso();
      const common = commonProgressFields(args, [
        "manualTimeSpent",
        "showSeasonNumber",
        "showEpisodeNumber",
        "animeEpisodeNumber",
        "podcastEpisodeNumber",
        "mangaChapterNumber",
        "mangaVolumeNumber",
      ]);

      let change: Record<string, unknown>;
      if (args.action === "start") {
        change = { createNewInProgress: { startedOn: timestamp, ...common } };
      } else if (args.action === "complete") {
        change = completedChange(timestamp, args.startedOn, common);
      } else if (args.action === "set_state") {
        if (!args.state)
          throw new Error("state is required when action is set_state");
        change = { changeLatestState: args.state };
      } else {
        if (args.percent === undefined)
          throw new Error("percent is required when action is set_percent");
        change = { changeLatestInProgress: args.percent };
      }

      return asText(await deployProgress(args.metadataId, change));
    },
  );

  server.registerTool(
    "ryot_mark_movie_watched",
    {
      title: "Mark movie watched",
      description:
        "Log a movie as completed/watched, optionally with startedOn and manualTimeSpent.",
      inputSchema: {
        metadataId: z.string(),
        timestamp: DateTimeString.optional(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
      },
    },
    async ({ metadataId, timestamp, startedOn, manualTimeSpent }) =>
      asText(
        await deployProgress(
          metadataId,
          completedChange(
            timestamp ?? nowIso(),
            startedOn,
            commonProgressFields({ manualTimeSpent }, ["manualTimeSpent"]),
          ),
        ),
      ),
  );

  server.registerTool(
    "ryot_mark_movie_in_progress",
    {
      title: "Mark movie in progress",
      description: "Start a new in-progress entry for a movie.",
      inputSchema: {
        metadataId: z.string(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
      },
    },
    async ({ metadataId, startedOn, manualTimeSpent }) =>
      asText(
        await deployProgress(metadataId, {
          createNewInProgress: {
            startedOn: startedOn ?? nowIso(),
            ...commonProgressFields({ manualTimeSpent }, ["manualTimeSpent"]),
          },
        }),
      ),
  );

  server.registerTool(
    "ryot_mark_show_episode_watched",
    {
      title: "Mark show episode watched",
      description:
        "Log one TV show episode as watched/completed, for example S01E05.",
      inputSchema: {
        metadataId: z.string(),
        seasonNumber: z.number().int().min(0),
        episodeNumber: z.number().int().min(0),
        timestamp: DateTimeString.optional(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
      },
    },
    async ({
      metadataId,
      seasonNumber,
      episodeNumber,
      timestamp,
      startedOn,
      manualTimeSpent,
    }) =>
      asText(
        await deployProgress(
          metadataId,
          completedChange(timestamp ?? nowIso(), startedOn, {
            showSeasonNumber: seasonNumber,
            showEpisodeNumber: episodeNumber,
            ...commonProgressFields({ manualTimeSpent }, ["manualTimeSpent"]),
          }),
        ),
      ),
  );

  server.registerTool(
    "ryot_mark_show_episode_started",
    {
      title: "Mark show episode started",
      description: "Start an in-progress entry for a specific TV episode.",
      inputSchema: {
        metadataId: z.string(),
        seasonNumber: z.number().int().min(0),
        episodeNumber: z.number().int().min(0),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
      },
    },
    async ({
      metadataId,
      seasonNumber,
      episodeNumber,
      startedOn,
      manualTimeSpent,
    }) =>
      asText(
        await deployProgress(metadataId, {
          createNewInProgress: {
            startedOn: startedOn ?? nowIso(),
            showSeasonNumber: seasonNumber,
            showEpisodeNumber: episodeNumber,
            ...commonProgressFields({ manualTimeSpent }, ["manualTimeSpent"]),
          },
        }),
      ),
  );

  server.registerTool(
    "ryot_mark_show_in_progress",
    {
      title: "Mark show in progress",
      description:
        "Mark a show's latest entry as in progress, or create a new in-progress entry if no episode is supplied.",
      inputSchema: {
        metadataId: z.string(),
        seasonNumber: z.number().int().min(0).optional(),
        episodeNumber: z.number().int().min(0).optional(),
        startedOn: DateTimeString.optional(),
      },
    },
    async ({ metadataId, seasonNumber, episodeNumber, startedOn }) => {
      const change =
        seasonNumber !== undefined && episodeNumber !== undefined
          ? {
              createNewInProgress: {
                startedOn: startedOn ?? nowIso(),
                showSeasonNumber: seasonNumber,
                showEpisodeNumber: episodeNumber,
              },
            }
          : { changeLatestState: "IN_PROGRESS" };
      return asText(await deployProgress(metadataId, change));
    },
  );

  server.registerTool(
    "ryot_mark_game_started",
    {
      title: "Mark game started",
      description: "Start playing a game in Ryot.",
      inputSchema: {
        metadataId: z.string(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
      },
    },
    async ({ metadataId, startedOn, manualTimeSpent }) =>
      asText(
        await deployProgress(metadataId, {
          createNewInProgress: {
            startedOn: startedOn ?? nowIso(),
            ...commonProgressFields({ manualTimeSpent }, ["manualTimeSpent"]),
          },
        }),
      ),
  );

  server.registerTool(
    "ryot_mark_game_completed",
    {
      title: "Mark game completed",
      description: "Mark a game as completed in Ryot.",
      inputSchema: {
        metadataId: z.string(),
        timestamp: DateTimeString.optional(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
      },
    },
    async ({ metadataId, timestamp, startedOn, manualTimeSpent }) =>
      asText(
        await deployProgress(
          metadataId,
          completedChange(
            timestamp ?? nowIso(),
            startedOn,
            commonProgressFields({ manualTimeSpent }, ["manualTimeSpent"]),
          ),
        ),
      ),
  );

  server.registerTool(
    "ryot_mark_game_dropped",
    {
      title: "Mark game dropped",
      description: "Mark the latest game progress entry as dropped.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) =>
      asText(
        await deployProgress(metadataId, { changeLatestState: "DROPPED" }),
      ),
  );

  server.registerTool(
    "ryot_mark_game_on_hold",
    {
      title: "Mark game on hold",
      description: "Mark the latest game progress entry as on hold.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) =>
      asText(
        await deployProgress(metadataId, { changeLatestState: "ON_A_HOLD" }),
      ),
  );

  server.registerTool(
    "ryot_update_game_progress_percent",
    {
      title: "Update game progress percent",
      description:
        "Set progress percentage for the latest in-progress game entry.",
      inputSchema: {
        metadataId: z.string(),
        percent: DecimalLike.describe("0 to 100"),
      },
    },
    async ({ metadataId, percent }) =>
      asText(
        await deployProgress(metadataId, { changeLatestInProgress: percent }),
      ),
  );

  server.registerTool(
    "ryot_create_collection",
    {
      title: "Create collection",
      description:
        "Create or update a Ryot collection such as Watchlist, Game backlog, Wishlist, or Fitness references.",
      inputSchema: {
        name: z.string(),
        updateId: z.string().optional(),
        description: z.string().optional(),
        collaborators: z.array(z.string()).optional(),
      },
    },
    async (input) =>
      asText(
        await ryotGraphql(
          `mutation CreateOrUpdateCollection($input: CreateOrUpdateCollectionInput!) { createOrUpdateCollection(input: $input) { id } }`,
          { input },
        ),
      ),
  );

  server.registerTool(
    "ryot_add_to_collection",
    {
      title: "Add entities to collection",
      description:
        "Add metadata, games, exercises, workouts, templates, or measurements to a Ryot collection. creatorUserId is required by Ryot; can be set via RYOT_USER_ID.",
      inputSchema: {
        creatorUserId: z
          .string()
          .optional()
          .describe("Ryot user ID. If omitted, RYOT_USER_ID env var is used."),
        collectionName: z.string(),
        entities: z
          .array(
            z.object({
              entityId: z.string(),
              entityLot: EntityLot.default("METADATA"),
              information: z.unknown().optional(),
            }),
          )
          .min(1),
      },
    },
    async ({ creatorUserId, collectionName, entities }) =>
      asText(
        await ryotGraphql(
          `mutation DeployAddEntitiesToCollectionJob($input: ChangeCollectionToEntitiesInput!) { deployAddEntitiesToCollectionJob(input: $input) }`,
          {
            input: {
              creatorUserId: creatorUserIdFrom(creatorUserId),
              collectionName,
              entities,
            },
          },
        ),
      ),
  );

  server.registerTool(
    "ryot_add_movie_to_watchlist",
    {
      title: "Add movie to watchlist",
      description:
        "Add a movie metadata item to your movie watchlist collection. Defaults to RYOT_MOVIE_WATCHLIST_COLLECTION or 'Movie Watchlist'.",
      inputSchema: {
        metadataId: z.string(),
        creatorUserId: z.string().optional(),
        collectionName: z.string().optional(),
        information: z.unknown().optional(),
      },
    },
    async ({ metadataId, creatorUserId, collectionName, information }) =>
      asText(
        await addMetadataToCollection(
          creatorUserIdFrom(creatorUserId),
          resolveOptionalDefault(
            collectionName,
            COMMON_COLLECTION_ENV.movieWatchlist,
            "Movie Watchlist",
          ),
          metadataId,
          information,
        ),
      ),
  );

  server.registerTool(
    "ryot_add_show_to_watchlist",
    {
      title: "Add show to watchlist",
      description:
        "Add a TV show metadata item to your show watchlist collection. Defaults to RYOT_SHOW_WATCHLIST_COLLECTION or 'Show Watchlist'.",
      inputSchema: {
        metadataId: z.string(),
        creatorUserId: z.string().optional(),
        collectionName: z.string().optional(),
        information: z.unknown().optional(),
      },
    },
    async ({ metadataId, creatorUserId, collectionName, information }) =>
      asText(
        await addMetadataToCollection(
          creatorUserIdFrom(creatorUserId),
          resolveOptionalDefault(
            collectionName,
            COMMON_COLLECTION_ENV.showWatchlist,
            "Show Watchlist",
          ),
          metadataId,
          information,
        ),
      ),
  );

  server.registerTool(
    "ryot_add_game_to_backlog",
    {
      title: "Add game to backlog",
      description:
        "Add a video game metadata item to your game backlog collection. Defaults to RYOT_GAME_BACKLOG_COLLECTION or 'Game Backlog'.",
      inputSchema: {
        metadataId: z.string(),
        creatorUserId: z.string().optional(),
        collectionName: z.string().optional(),
        information: z.unknown().optional(),
      },
    },
    async ({ metadataId, creatorUserId, collectionName, information }) =>
      asText(
        await addMetadataToCollection(
          creatorUserIdFrom(creatorUserId),
          resolveOptionalDefault(
            collectionName,
            COMMON_COLLECTION_ENV.gameBacklog,
            "Game Backlog",
          ),
          metadataId,
          information,
        ),
      ),
  );
}

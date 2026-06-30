import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asText, nowIso, resolveOptionalDefault } from "./common.js";
import { ryotGraphql, ryotRootOperation } from "./ryot.js";
import { DateTimeString, DecimalLike, MediaSource } from "./schemas.js";

function creatorUserIdFrom(input?: string) {
  const creatorUserId = input || process.env.RYOT_USER_ID;
  if (!creatorUserId)
    throw new Error(
      "creatorUserId is required. Pass it in the tool input or set RYOT_USER_ID in the MCP env.",
    );
  return creatorUserId;
}

function collectionDefault(
  input: string | undefined,
  envName: string,
  fallback: string,
) {
  return resolveOptionalDefault(input, envName, fallback);
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

async function searchMetadata(
  query: string,
  lot: string,
  source: string,
  page?: number,
  sourceSpecifics?: unknown,
) {
  const input: Record<string, unknown> = {
    lot,
    source,
    search: { query, page },
  };
  if (sourceSpecifics !== undefined) input.sourceSpecifics = sourceSpecifics;
  return ryotRootOperation("query", "metadataSearch", { input }, 3);
}

function completedChange(
  timestamp: string,
  startedOn: string | undefined,
  common: Record<string, unknown> = {},
) {
  return startedOn
    ? {
        createNewCompleted: {
          startedAndFinishedOnDate: { startedOn, timestamp, ...common },
        },
      }
    : { createNewCompleted: { finishedOnDate: { timestamp, ...common } } };
}

function hasCachePath(path: string[]) {
  return path.some((p) => /cache|search/i.test(p));
}

function findFirstMetadataId(
  value: unknown,
  path: string[] = [],
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstMetadataId(item, path);
      if (found) return found;
    }
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  for (const key of ["metadataId", "entityId", "id"]) {
    const candidate = obj[key];
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      !hasCachePath([...path, key])
    )
      return candidate;
  }

  for (const [key, child] of Object.entries(obj)) {
    const found = findFirstMetadataId(child, [...path, key]);
    if (found) return found;
  }
  return undefined;
}

function findEpisodeNumbers(value: unknown): {
  seasonNumber?: number;
  episodeNumber?: number;
} {
  const found: { seasonNumber?: number; episodeNumber?: number } = {};
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const obj = v as Record<string, unknown>;
    const season = obj.seasonNumber ?? obj.showSeasonNumber;
    const episode = obj.episodeNumber ?? obj.showEpisodeNumber;
    if (typeof season === "number" && found.seasonNumber === undefined)
      found.seasonNumber = season;
    if (typeof episode === "number" && found.episodeNumber === undefined)
      found.episodeNumber = episode;
    for (const child of Object.values(obj)) visit(child);
  };
  visit(value);
  return found;
}

async function searchAndResolveId(
  query: string,
  lot: string,
  source: string,
  page?: number,
  sourceSpecifics?: unknown,
) {
  const search = await searchMetadata(
    query,
    lot,
    source,
    page,
    sourceSpecifics,
  );
  const metadataId = findFirstMetadataId(search.data);
  if (!metadataId) {
    return {
      metadataId: undefined,
      search,
      note: "Could not auto-resolve a metadataId from Ryot's search response. Use ryot_search_* and then pass the selected metadataId to the action tool.",
    };
  }
  return { metadataId, search };
}

const RawInput = z.record(z.string(), z.unknown());

export function registerMediaConvenienceTools(server: McpServer) {
  server.registerTool(
    "ryot_search_and_start_game",
    {
      title: "Search and start game",
      description:
        "Search a game by title and start it in Ryot using the first resolvable search result. If no metadataId can be resolved, returns the search response instead.",
      inputSchema: {
        query: z.string(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["IGDB", "GIANT_BOMB", "CUSTOM"]).default("IGDB"),
        allowGamesWithParent: z.boolean().optional(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
      },
    },
    async ({
      query,
      page,
      source,
      allowGamesWithParent,
      startedOn,
      manualTimeSpent,
    }) => {
      const sourceSpecifics =
        source === "IGDB" && allowGamesWithParent !== undefined
          ? { igdb: { filters: { allowGamesWithParent } } }
          : undefined;
      const resolved = await searchAndResolveId(
        query,
        "VIDEO_GAME",
        source,
        page,
        sourceSpecifics,
      );
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await deployProgress(resolved.metadataId, {
        createNewInProgress: {
          startedOn: startedOn ?? nowIso(),
          ...(manualTimeSpent !== undefined ? { manualTimeSpent } : {}),
        },
      });
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_search_and_update_game_progress",
    {
      title: "Search and update game progress",
      description:
        "Search a game by title and set progress percentage on its latest in-progress entry.",
      inputSchema: {
        query: z.string(),
        percent: DecimalLike,
        page: z.number().int().min(1).optional(),
        source: z.enum(["IGDB", "GIANT_BOMB", "CUSTOM"]).default("IGDB"),
      },
    },
    async ({ query, percent, page, source }) => {
      const resolved = await searchAndResolveId(
        query,
        "VIDEO_GAME",
        source,
        page,
      );
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await deployProgress(resolved.metadataId, {
        changeLatestInProgress: percent,
      });
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_search_and_mark_game_completed",
    {
      title: "Search and complete game",
      description: "Search a game by title and mark it completed.",
      inputSchema: {
        query: z.string(),
        timestamp: DateTimeString.optional(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["IGDB", "GIANT_BOMB", "CUSTOM"]).default("IGDB"),
      },
    },
    async ({ query, timestamp, startedOn, manualTimeSpent, page, source }) => {
      const resolved = await searchAndResolveId(
        query,
        "VIDEO_GAME",
        source,
        page,
      );
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await deployProgress(
        resolved.metadataId,
        completedChange(
          timestamp ?? nowIso(),
          startedOn,
          manualTimeSpent !== undefined ? { manualTimeSpent } : {},
        ),
      );
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_search_and_add_game_to_backlog",
    {
      title: "Search and add game to backlog",
      description:
        "Search a game by title and add the first resolvable result to the Game Backlog collection.",
      inputSchema: {
        query: z.string(),
        creatorUserId: z.string().optional(),
        collectionName: z.string().optional(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["IGDB", "GIANT_BOMB", "CUSTOM"]).default("IGDB"),
        information: z.unknown().optional(),
      },
    },
    async ({
      query,
      creatorUserId,
      collectionName,
      page,
      source,
      information,
    }) => {
      const resolved = await searchAndResolveId(
        query,
        "VIDEO_GAME",
        source,
        page,
      );
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await addMetadataToCollection(
        creatorUserIdFrom(creatorUserId),
        collectionDefault(
          collectionName,
          "RYOT_GAME_BACKLOG_COLLECTION",
          "Game Backlog",
        ),
        resolved.metadataId,
        information,
      );
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_search_and_mark_movie_watched",
    {
      title: "Search and mark movie watched",
      description: "Search a movie by title and mark it watched/completed.",
      inputSchema: {
        query: z.string(),
        timestamp: DateTimeString.optional(),
        startedOn: DateTimeString.optional(),
        manualTimeSpent: z.number().int().nonnegative().optional(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["TMDB", "CUSTOM"]).default("TMDB"),
      },
    },
    async ({ query, timestamp, startedOn, manualTimeSpent, page, source }) => {
      const resolved = await searchAndResolveId(query, "MOVIE", source, page);
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await deployProgress(
        resolved.metadataId,
        completedChange(
          timestamp ?? nowIso(),
          startedOn,
          manualTimeSpent !== undefined ? { manualTimeSpent } : {},
        ),
      );
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_search_and_add_movie_to_watchlist",
    {
      title: "Search and add movie to watchlist",
      description:
        "Search a movie by title and add the first resolvable result to the Movie Watchlist collection.",
      inputSchema: {
        query: z.string(),
        creatorUserId: z.string().optional(),
        collectionName: z.string().optional(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["TMDB", "CUSTOM"]).default("TMDB"),
        information: z.unknown().optional(),
      },
    },
    async ({
      query,
      creatorUserId,
      collectionName,
      page,
      source,
      information,
    }) => {
      const resolved = await searchAndResolveId(query, "MOVIE", source, page);
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await addMetadataToCollection(
        creatorUserIdFrom(creatorUserId),
        collectionDefault(
          collectionName,
          "RYOT_MOVIE_WATCHLIST_COLLECTION",
          "Movie Watchlist",
        ),
        resolved.metadataId,
        information,
      );
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_search_and_add_show_to_watchlist",
    {
      title: "Search and add show to watchlist",
      description:
        "Search a show by title and add the first resolvable result to the Show Watchlist collection.",
      inputSchema: {
        query: z.string(),
        creatorUserId: z.string().optional(),
        collectionName: z.string().optional(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["TMDB", "TVDB", "CUSTOM"]).default("TMDB"),
        information: z.unknown().optional(),
      },
    },
    async ({
      query,
      creatorUserId,
      collectionName,
      page,
      source,
      information,
    }) => {
      const resolved = await searchAndResolveId(query, "SHOW", source, page);
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await addMetadataToCollection(
        creatorUserIdFrom(creatorUserId),
        collectionDefault(
          collectionName,
          "RYOT_SHOW_WATCHLIST_COLLECTION",
          "Show Watchlist",
        ),
        resolved.metadataId,
        information,
      );
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_search_and_mark_show_episode_watched",
    {
      title: "Search and mark show episode watched",
      description:
        "Search a show by title and mark a specific episode watched, for example S01E05.",
      inputSchema: {
        query: z.string(),
        seasonNumber: z.number().int().min(0),
        episodeNumber: z.number().int().min(0),
        timestamp: DateTimeString.optional(),
        startedOn: DateTimeString.optional(),
        page: z.number().int().min(1).optional(),
        source: z.enum(["TMDB", "TVDB", "CUSTOM"]).default("TMDB"),
      },
    },
    async ({
      query,
      seasonNumber,
      episodeNumber,
      timestamp,
      startedOn,
      page,
      source,
    }) => {
      const resolved = await searchAndResolveId(query, "SHOW", source, page);
      if (!resolved.metadataId) return asText(resolved);
      const mutation = await deployProgress(
        resolved.metadataId,
        completedChange(timestamp ?? nowIso(), startedOn, {
          showSeasonNumber: seasonNumber,
          showEpisodeNumber: episodeNumber,
        }),
      );
      return asText({
        metadataId: resolved.metadataId,
        mutation,
        search: resolved.search,
      });
    },
  );

  server.registerTool(
    "ryot_get_next_show_episode",
    {
      title: "Get next show episode",
      description:
        "Return Ryot's userMetadataDetails for a show and best-effort extracted next season/episode from nextEntry.",
      inputSchema: { metadataId: z.string() },
    },
    async ({ metadataId }) => {
      const details = await ryotRootOperation(
        "query",
        "userMetadataDetails",
        { metadataId },
        4,
      );
      const nextEntry = JSON.stringify(details.data).includes("nextEntry")
        ? (details.data as Record<string, unknown>)
        : details.data;
      return asText({
        extracted: findEpisodeNumbers(details.data),
        nextEntry,
        details,
      });
    },
  );

  server.registerTool(
    "ryot_mark_next_show_episode_watched",
    {
      title: "Mark next show episode watched",
      description:
        "Get Ryot's nextEntry for a show and mark that episode watched. Falls back with details if season/episode cannot be detected.",
      inputSchema: {
        metadataId: z.string(),
        timestamp: DateTimeString.optional(),
        startedOn: DateTimeString.optional(),
      },
    },
    async ({ metadataId, timestamp, startedOn }) => {
      const details = await ryotRootOperation(
        "query",
        "userMetadataDetails",
        { metadataId },
        4,
      );
      const { seasonNumber, episodeNumber } = findEpisodeNumbers(details.data);
      if (seasonNumber === undefined || episodeNumber === undefined)
        return asText({
          note: "Could not extract season/episode from userMetadataDetails.",
          details,
        });
      const mutation = await deployProgress(
        metadataId,
        completedChange(timestamp ?? nowIso(), startedOn, {
          showSeasonNumber: seasonNumber,
          showEpisodeNumber: episodeNumber,
        }),
      );
      return asText({ seasonNumber, episodeNumber, mutation, details });
    },
  );

  server.registerTool(
    "ryot_list_collections",
    {
      title: "List collections",
      description:
        "List Ryot collections. If your schema requires an input, pass it as rawInput.",
      inputSchema: { rawInput: RawInput.optional() },
    },
    async ({ rawInput }) =>
      asText(
        await ryotRootOperation(
          "query",
          "userCollectionsList",
          rawInput ? { input: rawInput } : {},
          3,
        ),
      ),
  );

  server.registerTool(
    "ryot_collection_contents",
    {
      title: "Collection contents",
      description:
        "Fetch collection contents using the raw CollectionContents input expected by your Ryot schema.",
      inputSchema: { input: RawInput },
    },
    async ({ input }) =>
      asText(
        await ryotRootOperation("query", "collectionContents", { input }, 3),
      ),
  );

  server.registerTool(
    "ryot_user_metadata_list",
    {
      title: "User metadata list",
      description:
        "List user media using the raw userMetadataList input supported by your Ryot schema. Useful for watchlists, in-progress items, and history after schema discovery.",
      inputSchema: { input: RawInput },
    },
    async ({ input }) =>
      asText(
        await ryotRootOperation("query", "userMetadataList", { input }, 3),
      ),
  );

  server.registerTool(
    "ryot_create_default_collections",
    {
      title: "Create default media collections",
      description:
        "Create common Ryot collections for movies, shows, games, favorites, abandoned items, currently playing, short games, and comfort shows.",
      inputSchema: {
        collections: z.array(z.string()).optional(),
        descriptionPrefix: z.string().default("Created by Ryot MCP"),
      },
    },
    async ({ collections, descriptionPrefix }) => {
      const names = collections ?? [
        collectionDefault(
          undefined,
          "RYOT_MOVIE_WATCHLIST_COLLECTION",
          "Movie Watchlist",
        ),
        collectionDefault(
          undefined,
          "RYOT_SHOW_WATCHLIST_COLLECTION",
          "Show Watchlist",
        ),
        collectionDefault(
          undefined,
          "RYOT_GAME_BACKLOG_COLLECTION",
          "Game Backlog",
        ),
        "Currently Playing",
        "Favorites",
        "Abandoned",
        "Short Games",
        "Comfort Shows",
      ];
      const results = [];
      for (const name of names) {
        results.push(
          await ryotGraphql(
            `mutation CreateOrUpdateCollection($input: CreateOrUpdateCollectionInput!) { createOrUpdateCollection(input: $input) { id } }`,
            { input: { name, description: `${descriptionPrefix}: ${name}` } },
          ),
        );
      }
      return asText({ createdOrUpdated: names, results });
    },
  );

  server.registerTool(
    "ryot_create_or_update_review",
    {
      title: "Create or update review",
      description:
        "Create/update a Ryot review with raw CreateOrUpdateReviewInput. Use schema discovery if your Ryot version needs exact fields.",
      inputSchema: { input: RawInput },
    },
    async ({ input }) =>
      asText(
        await ryotGraphql(
          `mutation CreateOrUpdateReview($input: CreateOrUpdateReviewInput!) { createOrUpdateReview(input: $input) { id } }`,
          { input },
        ),
      ),
  );

  server.registerTool(
    "ryot_delete_review",
    {
      title: "Delete review",
      description: "Delete a Ryot review by reviewId.",
      inputSchema: { reviewId: z.string() },
    },
    async ({ reviewId }) =>
      asText(
        await ryotRootOperation("mutation", "deleteReview", { reviewId }, 1),
      ),
  );
}

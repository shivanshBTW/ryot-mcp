import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asText } from "./common.js";
import {
  candidateOperations,
  getGraphqlUrl,
  ryotGraphql,
  schemaSearch,
} from "./ryot.js";

export function registerDiscoveryTools(server: McpServer) {
  server.registerTool(
    "ryot_health_check",
    {
      title: "Ryot health check",
      description: "Check whether the MCP can reach Ryot's GraphQL endpoint.",
      inputSchema: {},
    },
    async () => {
      const result = await ryotGraphql("query { __typename }");
      return asText({ graphqlUrl: getGraphqlUrl(), result });
    },
  );

  server.registerTool(
    "ryot_graphql",
    {
      title: "Run Ryot GraphQL",
      description:
        "Run a GraphQL query or mutation against Ryot. Use after discovering the schema.",
      inputSchema: {
        query: z.string().describe("GraphQL operation text"),
        variables: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("GraphQL variables"),
      },
    },
    async ({ query, variables }) => asText(await ryotGraphql(query, variables)),
  );

  server.registerTool(
    "ryot_schema_search",
    {
      title: "Search Ryot schema",
      description:
        "Search the live Ryot GraphQL schema for types, fields, inputs, queries, and mutations.",
      inputSchema: {
        keywords: z
          .array(z.string())
          .min(1)
          .describe(
            "Terms like workout, routine, exercise, set, movie, show, game, collection",
          ),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ keywords, limit }) => asText(await schemaSearch(keywords, limit)),
  );

  server.registerTool(
    "ryot_find_candidate_operations",
    {
      title: "Find candidate Ryot operations",
      description:
        "Find likely root GraphQL queries/mutations for the requested domain.",
      inputSchema: {
        keywords: z.array(z.string()).min(1),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ keywords, limit }) =>
      asText(await candidateOperations(keywords, limit)),
  );

  server.registerTool(
    "ryot_workout_discovery",
    {
      title: "Discover workout and routine API",
      description:
        "Find Ryot schema operations and fields related to workouts, routines, exercises, sets, measurements, and fitness progress.",
      inputSchema: { limit: z.number().int().min(1).max(200).default(100) },
    },
    async ({ limit }) => {
      const keywords = [
        "workout",
        "routine",
        "exercise",
        "fitness",
        "measurement",
        "set",
        "rep",
        "weight",
      ];
      return asText({
        operations: await candidateOperations(keywords, limit),
        schemaMatches: await schemaSearch(keywords, limit),
      });
    },
  );

  server.registerTool(
    "ryot_media_discovery",
    {
      title: "Discover media API",
      description:
        "Find Ryot schema operations and fields related to movies, shows, books, podcasts, music, watchlists, and collections.",
      inputSchema: { limit: z.number().int().min(1).max(200).default(100) },
    },
    async ({ limit }) => {
      const keywords = [
        "movie",
        "show",
        "book",
        "podcast",
        "music",
        "watch",
        "collection",
        "review",
        "metadata",
      ];
      return asText({
        operations: await candidateOperations(keywords, limit),
        schemaMatches: await schemaSearch(keywords, limit),
      });
    },
  );

  server.registerTool(
    "ryot_game_discovery",
    {
      title: "Discover game API",
      description:
        "Find Ryot schema operations and fields related to video games, gaming progress, reviews, and collections.",
      inputSchema: { limit: z.number().int().min(1).max(200).default(100) },
    },
    async ({ limit }) => {
      const keywords = [
        "game",
        "videoGame",
        "gaming",
        "played",
        "progress",
        "collection",
        "review",
        "metadata",
      ];
      return asText({
        operations: await candidateOperations(keywords, limit),
        schemaMatches: await schemaSearch(keywords, limit),
      });
    },
  );
}

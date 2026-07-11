# Ryot MCP Starter

A local/private MCP server for a self-hosted Ryot instance, focused on workouts/routines, body measurements, movies, shows, and games.

## Project layout

```text
src/
  index.ts              # MCP bootstrap only
  ryot.ts               # GraphQL client + live schema helpers
  schemas.ts            # Shared zod schemas/enums
  common.ts             # Shared helpers
  discovery-tools.ts    # Schema/debug/discovery tools
  workout-tools.ts      # Fitness, measurements, routine tools
  media-tools.ts        # Movies, shows, games, collections, progress tools
  media-convenience-tools.ts # Search-and-act, next-episode, collections, raw review helpers
```

## Configure Cursor/Claude

```json
{
  "mcpServers": {
    "ryot": {
      "command": "node",
      "args": ["/absolute/path/to/ryot-mcp-starter/dist/index.js"],
      "env": {
        "RYOT_BASE_URL": "https://ryot.shivansh.top",
        "RYOT_AUTH_HEADER": "Bearer YOUR_RYOT_API_TOKEN",
        "RYOT_COOKIE": "",
        "RYOT_USER_ID": "",
        "RYOT_MOVIE_WATCHLIST_COLLECTION": "Movie Watchlist",
        "RYOT_SHOW_WATCHLIST_COLLECTION": "Show Watchlist",
        "RYOT_GAME_BACKLOG_COLLECTION": "Game Backlog",
        "RYOT_WALKING_EXERCISE_ID": "",
        "RYOT_SIT_TO_STAND_EXERCISE_ID": "",
        "RYOT_WALL_PUSHUP_EXERCISE_ID": ""
      }
    }
  }
}
```

`RYOT_AUTH_HEADER` should contain the exact working Authorization value. For Ryot integration tokens this is usually `Bearer <token>`.

`RYOT_USER_ID` is only needed for collection tools such as adding a movie to watchlist or a game to backlog.

## Build

```bash
npm install
npm run build
```

Restart Cursor/Claude after every rebuild.

## Tools

### Core/debug

- `ryot_health_check`
- `ryot_graphql`
- `ryot_schema_search`
- `ryot_find_candidate_operations`
- `ryot_workout_discovery`
- `ryot_media_discovery`
- `ryot_game_discovery`

### Fitness/routines

- `ryot_search_exercises`
- `ryot_list_recent_workouts`
- `ryot_list_workout_templates`
- `ryot_get_workout_details`
- `ryot_get_workout_template_details`
- `ryot_log_workout`
- `ryot_create_workout_template`
- `ryot_log_body_measurement`
- `ryot_log_walk`
- `ryot_log_bodyweight_set`
- `ryot_log_minimum_workout`
- `ryot_create_minimum_routine_template`
- `ryot_start_today_routine`
- `ryot_log_weight`
- `ryot_log_waist`
- `ryot_list_measurements`
- `ryot_log_minimum_day`
- `ryot_log_recovery_day`
- `ryot_get_weekly_workout_summary`

### General media

- `ryot_search_media`
- `ryot_get_metadata_details`
- `ryot_get_user_metadata_details`
- `ryot_mark_media_progress`
- `ryot_create_collection`
- `ryot_add_to_collection`
- `ryot_list_collections`
- `ryot_collection_contents`
- `ryot_user_metadata_list`
- `ryot_create_default_collections`
- `ryot_create_or_update_review`
- `ryot_delete_review`

### Movies

- `ryot_search_movie`
- `ryot_get_movie_status`
- `ryot_mark_movie_in_progress`
- `ryot_mark_movie_watched`
- `ryot_add_movie_to_watchlist`
- `ryot_search_and_mark_movie_watched`
- `ryot_search_and_add_movie_to_watchlist`

### Shows

- `ryot_search_show`
- `ryot_get_show_status`
- `ryot_mark_show_in_progress`
- `ryot_mark_show_episode_started`
- `ryot_mark_show_episode_watched`
- `ryot_add_show_to_watchlist`
- `ryot_search_and_add_show_to_watchlist`
- `ryot_search_and_mark_show_episode_watched`
- `ryot_get_next_show_episode`
- `ryot_mark_next_show_episode_watched`

### Games

- `ryot_search_game`
- `ryot_get_game_status`
- `ryot_mark_game_started`
- `ryot_mark_game_completed`
- `ryot_mark_game_dropped`
- `ryot_mark_game_on_hold`
- `ryot_update_game_progress_percent`
- `ryot_add_game_to_backlog`
- `ryot_search_and_start_game`
- `ryot_search_and_update_game_progress`
- `ryot_search_and_mark_game_completed`
- `ryot_search_and_add_game_to_backlog`

## Notes

Ryot list/search endpoints often return a cached response object rather than full objects directly. This MCP uses live schema introspection to build valid GraphQL selections for object return types, so it should return whatever scalar/cached fields your Ryot version exposes without hard-coding wrapper field names.

For workout logging/templates, Ryot requires internal `exerciseId` values. Use `ryot_search_exercises` first, then pass those IDs to `ryot_log_workout` or set default exercise IDs in env vars.

### Duration units (important for agents)

Ryot uses **different units** on different fields. Getting this wrong makes a 5-minute walk show as 300 minutes.

| Field                                   | Unit        | Example                                 |
| --------------------------------------- | ----------- | --------------------------------------- |
| `exercises[].sets[].statistic.duration` | **minutes** | 5-min walk → `5` (not `300`)            |
| `workout.duration`                      | **seconds** | 7-min workout → `420`                   |
| `exercises[].sets[].restTime`           | **seconds** | 90-sec rest → `90`                      |
| `walkingMinutes` / `minutes` tool args  | **minutes** | Human input; helpers convert internally |

Run `ryot_workout_discovery` to see `durationUnits` in the response. Never multiply set duration by 60.

The high-level routine shortcuts can read default exercise IDs from env vars:

- `RYOT_WALKING_EXERCISE_ID`
- `RYOT_SIT_TO_STAND_EXERCISE_ID`
- `RYOT_WALL_PUSHUP_EXERCISE_ID`

The collection shortcut tools can read default collection names from env vars:

- `RYOT_MOVIE_WATCHLIST_COLLECTION`
- `RYOT_SHOW_WATCHLIST_COLLECTION`
- `RYOT_GAME_BACKLOG_COLLECTION`

The `ryot_search_and_*` tools are best-effort wrappers: if Ryot returns only a cached search ID and no metadata ID, they return the search response so you can pick the result and call the ID-based tool.

Review tools are intentionally raw until the exact `CreateOrUpdateReviewInput` for your Ryot version is confirmed with schema discovery.

Keep this MCP private/local. The generic `ryot_graphql` tool can run arbitrary queries/mutations against your Ryot account.

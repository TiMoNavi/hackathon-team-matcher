import "dotenv/config";

import http from "http";
import express from "express";
import cors from "cors";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { protectPostResults } from "./graphql/post-visibility";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";

import { Server as WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";

import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";
import { createContext, prisma } from "./context";

import { runVideoWorkerLoop } from "./workers/videoRenderWorker";
import cron from "node-cron";
import { runDailyDigest } from "./jobs/dailyDigest";
import { runCommunityInfluence } from "./jobs/communityInfluence";
import { runImageWorkerLoop } from "./workers/imageThumbWorker";
import { runStoryWorkerLoop } from "./workers/storyThumbWorker";
import { runAvatarWorkerLoop } from "./workers/avatarThumbWorker";
import { runVlogCoverWorkerLoop } from "./workers/vlogCoverThumbWorker";


const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 4000);
const GRAPHQL_PATH = "/graphql";

const ALLOWED_ORIGINS = new Set([
  "https://studio.apollographql.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:4173",
  "http://localhost:4174",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:4174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  ...(process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

function isAllowedCorsOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true);
    if (isAllowedCorsOrigin(origin)) return cb(null, true);
    console.warn("[CORS] blocked origin", origin);
    return cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Profile-Id", "x-profile-id"],
  optionsSuccessStatus: 204,
  credentials: true,
};

async function start() {
  const schema = protectPostResults(makeExecutableSchema({ typeDefs, resolvers }));

  const app = express();
  const httpServer = http.createServer(app);

  const apollo = new ApolloServer({
    schema,
    introspection: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async requestDidStart() {
          return {
            async didEncounterErrors(ctx) {
              for (const err of ctx.errors) {
                console.error("[GraphQL error]", {
                  message: err.message,
                  path: err.path,
                  extensions: err.extensions,
                  stack: err.stack,
                });
              }
            },
          };
        },
      },
    ],
  });

  await apollo.start();

  app.options("*", cors(corsOptions));

  app.use(
    GRAPHQL_PATH,
    cors(corsOptions),
    express.json(),
    expressMiddleware(apollo, {
      context: createContext as any,
    })
  );

  // Express errors (z.B. CORS) loggen
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("[Express error]", err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  // WS server
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: GRAPHQL_PATH,
  });

  const wsCleanup = useServer(
    {
      schema,
      context: async (ctx: any) => {
        const params = ctx.connectionParams as any;

        // ✅ beide Varianten (graphql-ws)
        const auth = params?.Authorization ?? params?.authorization ?? "";
        const xProfileId = params?.["x-profile-id"] ?? params?.["X-Profile-Id"] ?? "";

        const fakeReq = {
          headers: {
            authorization: auth,
            "x-profile-id": xProfileId,
          },
        } as any;

        try {
          return createContext.length === 1
            ? await (createContext as any)({ req: fakeReq })
            : await (createContext as any)(fakeReq);
        } catch {
          return {};
        }
      },
    },
    wsServer
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down...`);

    try {
      await wsCleanup.dispose();
    } catch (e) {
      console.error("[server] websocket cleanup failed", e);
    }

    try {
      await apollo.stop();
    } catch (e) {
      console.error("[server] apollo stop failed", e);
    }

    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) console.error("[server] http close failed", err);
        resolve();
      });
    });

    try {
      await prisma.$disconnect();
    } catch (e) {
      console.error("[server] prisma disconnect failed", e);
    }

    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  httpServer.listen(PORT, HOST, () => {
    console.log(`🚀 GraphQL HTTP ready at http://${HOST}:${PORT}${GRAPHQL_PATH}`);
    console.log(`🔌 GraphQL WS   ready at ws://${HOST}:${PORT}${GRAPHQL_PATH}`);

    if (process.env.ENABLE_VIDEO_WORKER === "true") {
      runVideoWorkerLoop().catch((e) => {
        console.error("[video-worker] crashed", e);
      });
    }

    if (process.env.ENABLE_IMAGE_WORKER === "true") {
      runImageWorkerLoop().catch((e) => {
        console.error("[image-worker] crashed", e);
      });
    }

    if (process.env.ENABLE_STORY_WORKER === "true") {
      runStoryWorkerLoop().catch((e) => {
        console.error("[story-worker] crashed", e);
      });
    }

    if (process.env.ENABLE_AVATAR_WORKER === "true") {
      runAvatarWorkerLoop().catch((e) => console.error("[avatar-worker] crashed", e));
    }

    if (process.env.ENABLE_VLOG_COVER_WORKER === "true") {
      runVlogCoverWorkerLoop().catch((e) => {
        console.error("[vlog-cover-worker] crashed", e);
      });
    }

    if (process.env.ENABLE_COMMUNITY_INFLUENCE_WORKER === "true") {
      let influenceRunning = false;
      cron.schedule("10 * * * *", async () => {
        if (influenceRunning) return;
        influenceRunning = true;
        try {
          const result = await runCommunityInfluence(prisma, { apply: true });
          if (result.errors.length) console.error("[community-influence] retry next run", result);
          else if (result.days) console.log("[community-influence] settled", result);
        } catch (error) { console.error("[community-influence] failed; retry next run", error); }
        finally { influenceRunning = false; }
      }, { timezone: "UTC" });
    }

    if (process.env.ENABLE_DAILY_DIGEST === "true") {
      cron.schedule(
        "45 14 * * *",
        async () => {
          try {
            await runDailyDigest(prisma);
            console.log("[daily-digest] done");
          } catch (e) {
            console.error("[daily-digest] failed", e);
          }
        },
        { timezone: "Europe/Vienna" }
      );
    }
  });
  

}

start().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});

import "dotenv/config";
import { runVideoWorkerLoop } from "./videoRenderWorker";

runVideoWorkerLoop().catch((e) => {
  console.error("[video-worker] fatal", e);
  process.exit(1);
});

import "dotenv/config";

import { ensureBrowserUploadCors } from "../s3";

ensureBrowserUploadCors()
  .then(() => {
    console.log("[s3] browser upload CORS synced");
  })
  .catch((error) => {
    console.error("[s3] browser upload CORS sync failed", error);
    process.exit(1);
  });

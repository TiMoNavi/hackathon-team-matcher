// Local reference runner. Original template source and lockfile stay unchanged.
// The Next font-loader fixture hook supplies real, archived official font files.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [
  path.join(__dirname, 'node_modules/next/dist/bin/next'),
  'dev', '--webpack', '--hostname', '127.0.0.1', '--port',
  process.env.SOHO_PREVIEW_PORT || '4197',
], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_USE_SYSTEM_CA: '1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(__dirname, 'reference-assets/google-font-cache.cjs'),
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

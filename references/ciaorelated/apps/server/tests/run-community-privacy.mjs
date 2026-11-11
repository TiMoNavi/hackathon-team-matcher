import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const testRequire = process.env.COMMUNITY_TEST_DEPS
  ? createRequire(join(resolve(process.env.COMMUNITY_TEST_DEPS), 'package.json')) : require;
const { values } = parseArgs({ options: { postgres: { type: 'boolean', default: false } } });
const native = values.postgres;
const scratch = await mkdtemp(join(native ? '/tmp' : tmpdir(), 'bvrly-community-test-'));
const pg = (name, args, options = {}) => execFileSync(process.env.COMMUNITY_TEST_PG_BIN ? join(process.env.COMMUNITY_TEST_PG_BIN, name) : name, args, {
  encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' }, ...options,
});
let db, server, nativeStarted = false, port, url;
try {
  if (native) {
    // A new cluster, random loopback port and private socket directory: never reuse a running database.
    const probe = createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
    port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    pg('initdb', ['-D', join(scratch, 'data'), '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    pg('pg_ctl', ['-D', join(scratch, 'data'), '-l', join(scratch, 'postgres.log'), '-w', 'start', '-o',
      `-h 127.0.0.1 -p ${port} -k ${scratch} -F -c timezone=UTC`]);
    nativeStarted = true;
    db = { exec: async sql => pg('psql', ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql }) };
  } else {
    const { PGlite } = await import(pathToFileURL(testRequire.resolve('@electric-sql/pglite')).href);
    db = await PGlite.create();
  }
  // Match the UTC PostgreSQL deployment required by Prisma's timestamp columns.
  await db.exec("SET TIME ZONE 'UTC'");
  // Frozen baseline makes the historical data/backfill test reproducible after commit.
  const before = execFileSync('git', ['show', 'fcffa46:apps/server/prisma/schema.prisma'], { cwd: root });
  const beforePath = join(scratch, 'before.prisma');
  await writeFile(beforePath, before);
  const sql = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema-datamodel', beforePath, '--script'], {
    cwd: scratch, encoding: 'utf8', env: { ...process.env, DOTENV_CONFIG_PATH: '/dev/null' },
  });
  await db.exec(sql);
  await db.exec(`
    INSERT INTO "Account" (id) VALUES ('privacy_legacy_account');
    INSERT INTO "Profile" (id, username, "accountId") VALUES ('privacy_legacy_owner', 'privacy_legacy_owner', 'privacy_legacy_account');
    INSERT INTO "Profile" (id, username, "accountId") VALUES ('privacy_legacy_member', 'privacy_legacy_member', 'privacy_legacy_account');
    INSERT INTO "GroupLink" (id, code, title, "ownerId") VALUES ('privacy_legacy_group', 'privacy_legacy_code', 'Legacy private', 'privacy_legacy_owner');
    INSERT INTO "GroupLinkMember" ("groupLinkId", "profileId", "joinedAt") VALUES ('privacy_legacy_group', 'privacy_legacy_member', '2026-01-15T12:00:00Z');
    INSERT INTO "Context" (id, key, kind, label, "updatedAt") VALUES ('privacy_legacy_context', 'group:privacy_legacy_group', 'TOPIC', 'Legacy private', NOW());
    INSERT INTO "Post" (id, "authorId", "updatedAt") VALUES ('privacy_legacy_post', 'privacy_legacy_owner', NOW());
    INSERT INTO "PostContext" ("postId", "contextId", source) VALUES ('privacy_legacy_post', 'privacy_legacy_context', 'IMPORT');
  `);
  const migrations = [
    '20261006120000_community_visibility', '20261006150000_community_membership_history',
    '20261006170000_network_community', '20261006190000_community_influence_ledger',
    '20261006210000_community_influence_accrual', '20261006230000_influence_growth_positions',
    '20261007090000_influence_support',
  ];
  if (native) {
    url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=10`;
    const schemaPath = join(scratch, 'schema.prisma');
    await writeFile(schemaPath, await readFile(join(root, 'apps/server/prisma/schema.prisma')));
    const migrationRoot = join(scratch, 'migrations');
    const baseline = '20200101000000_test_baseline';
    await mkdir(join(migrationRoot, baseline), { recursive: true });
    await writeFile(join(migrationRoot, baseline, 'migration.sql'), sql);
    await writeFile(join(migrationRoot, 'migration_lock.toml'), 'provider = "postgresql"\n');
    for (const name of migrations) {
      await mkdir(join(migrationRoot, name));
      await writeFile(join(migrationRoot, name, 'migration.sql'), await readFile(join(root, 'apps/server/prisma/migrations', name, 'migration.sql')));
    }
    const migrate = (...args) => execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', ...args, '--schema', schemaPath], {
      cwd: scratch, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url, DOTENV_CONFIG_PATH: '/dev/null' },
    });
    // Resolve only the generated fixture baseline in this disposable database.
    migrate('resolve', '--applied', baseline);
    console.log(migrate('deploy').trim());
    const repeated = migrate('deploy');
    if (!repeated.includes('No pending migrations to apply')) throw new Error('Repeated migration deploy was not a no-op');
    console.log('Repeated migration deploy: no pending migrations.');
  } else {
    for (const name of migrations) await db.exec(await readFile(join(root, 'apps/server/prisma/migrations', name, 'migration.sql'), 'utf8'));
  }
  if (!native) {
    const { PGLiteSocketServer } = await import(pathToFileURL(testRequire.resolve('@electric-sql/pglite-socket')).href);
    port = Number(process.env.COMMUNITY_TEST_PORT || 55439);
    server = new PGLiteSocketServer({ db, host: '127.0.0.1', port, maxConnections: 10 });
    await server.start();
  }
  url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=${native ? 10 : 1}`;
  if (native) {
    const diff = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
      '--from-url', url, '--to-schema-datamodel', join(root, 'apps/server/prisma/schema.prisma'), '--exit-code'], {
      cwd: scratch, encoding: 'utf8', env: { ...process.env, DOTENV_CONFIG_PATH: '/dev/null' },
    });
    console.log('PostgreSQL migration/schema comparison:', diff.trim());
  }
  console.log(`Disposable local ${native ? 'PostgreSQL' : 'PGlite'} database ready; community migrations and inactive influence ledger applied.`);
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href,
      '--test', 'apps/server/tests/communityPrivacy.test.ts'], {
      cwd: root, stdio: 'inherit', env: {
        ...process.env, DOTENV_CONFIG_PATH: '/dev/null', DATABASE_URL: url, TEST_DATABASE_URL: url,
        TEST_DATABASE_ENGINE: native ? 'postgres' : 'pglite',
        JWT_SECRET: 'isolated-community-test-secret-not-for-production', CURRENT_TERMS_VERSION: '1',
        S3_BUCKET: 'privacy-tests', S3_REGION: 'us-east-1', S3_ENDPOINT: 'http://127.0.0.1:9',
        S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test', S3_FORCE_PATH_STYLE: 'true',
        SENDGRID_API_KEY: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '',
        ENABLE_COMMUNITY_INFLUENCE_RANKING: 'false', COMMUNITY_INFLUENCE_RANKING_STARTS_AT: '',
        COMMUNITY_INFLUENCE_RANKING_MAX_AGE_HOURS: '72', COMMUNITY_INFLUENCE_RANKING_HALF_LIFE_HOURS: '24',
        COMMUNITY_INFLUENCE_RANKING_MAX_PROMOTION: '12', COMMUNITY_INFLUENCE_RANKING_HALF_STRENGTH_POINTS: '5000',
      },
    });
    child.on('exit', code => resolve(code ?? 1));
    child.on('error', reject);
  });
} finally {
  if (server) await server.stop();
  if (nativeStarted || (native && existsSync(join(scratch, 'data/postmaster.pid')))) pg('pg_ctl', ['-D', join(scratch, 'data'), '-m', 'fast', '-w', 'stop']);
  if (!native && db) await db.close();
  await rm(scratch, { recursive: true, force: true });
}

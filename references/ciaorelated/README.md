# ciaorelated

Open-source Instagram-style social media app for groups, events, local communities, and shared moments.

`ciaorelated` is a full-stack social media starter built with React Native, Expo, Node.js, GraphQL, Prisma, and PostgreSQL. It combines familiar social app patterns like feeds, profiles, posts, stories/moments, follows, likes, comments, and chat with a stronger focus on real-world communities, group links, local discovery, and event-based social interaction.

> Goal: build a social media app that helps people connect through real groups, real events, and real moments.

## Try It

An early iOS build is available for feedback. It is still published under the previous Beverly branding and may lag behind `main` while the open-source version is being cleaned up:

<a href="https://apps.apple.com/at/app/beverly/id6751941066">Download the current Beverly iOS build on the App Store</a>

If you are reviewing the project, this is the fastest way to feel the feed, profile, moments, chats, and group invite flow without setting up providers first.

## Quickstart

After installing Node.js, pnpm, PostgreSQL, and Expo tooling, this is the shortest local path to a running feed:

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/ciaorelated/.env.example apps/ciaorelated/.env
createdb ciaorelated && pnpm --dir apps/server exec prisma migrate deploy
pnpm --dir apps/server dev
```

In a second terminal, set `EXPO_PUBLIC_API_URL` in `apps/ciaorelated/.env` to your machine's LAN URL, for example `http://192.168.1.50:4000/graphql`, then run:

```bash
pnpm --dir apps/ciaorelated start:device
```

Run `pnpm install` from the repository root. You do not need a separate install inside `apps/ciaorelated`; pnpm installs all workspace dependencies from the root.

If Expo asks to install `@types/react-native` or shows the deprecated global `expo-cli` warning, make sure dependencies were installed from the root and start the app through pnpm scripts. From `apps/ciaorelated`, the local Expo CLI is available at `../../node_modules/.bin/expo`; avoid a globally installed `expo` binary.

Local defaults are intentionally provider-light: SMS codes can be printed to the server console and AppsFlyer stays off. Media creation/upload flows need S3-compatible storage keys; without S3 configured you can still boot the app, authenticate, inspect the shell/navigation, and wire the backend before enabling uploads.

## Privacy By Default

`ciaorelated` does not initialize AppsFlyer or tracking by default. The app accepts normal invite links without AppsFlyer, and attribution only runs if you add your own keys and explicitly enable it:

```env
EXPO_PUBLIC_APPSFLYER_ENABLED=true
EXPO_PUBLIC_APPSFLYER_DEV_KEY=your-appsflyer-dev-key
```

No ads or third-party attribution are required to run the project locally.

## Screenshots

| Feed | Moments |
| --- | --- |
| ![ciaorelated feed screen](./docs/phonescreens-optimized/feed.jpg) | ![ciaorelated moments screen](./docs/phonescreens-optimized/moments.jpg) |

| Community Feed | Chat |
| --- | --- |
| ![ciaorelated community feed screen](./docs/phonescreens-optimized/communityfeed.jpg) | ![ciaorelated chat screen](./docs/phonescreens-optimized/chat.jpg) |

| Activity | Activity Settings |
| --- | --- |
| ![ciaorelated activity screen](./docs/phonescreens-optimized/activity.jpg) | ![ciaorelated activity settings screen](./docs/phonescreens-optimized/activitysettings.jpg) |

| Create Post | Create Story |
| --- | --- |
| ![ciaorelated create post screen](./docs/phonescreens-optimized/createpost.jpg) | ![ciaorelated create story screen](./docs/phonescreens-optimized/createstory.jpg) |

| Profile | Profile Settings |
| --- | --- |
| ![ciaorelated profile screen](./docs/phonescreens-optimized/profile.jpg) | ![ciaorelated profile settings screen](./docs/phonescreens-optimized/profilesettings.jpg) |

## Features

- Instagram-style home feed
- User profiles with avatars, bio, grid, posts, reels/moments, and counters
- Image and video posts
- Stories / moments style content
- Likes, comments, tagged users, and post detail views
- Follow and private profile flows
- Group/community links with invite and join flow
- QR/share-oriented group invite patterns
- Chat and messaging foundation
- Explore/search screen for discovering people and content
- Context-based discovery foundations
- Local city/profile onboarding
- Phone login and registration with SMS verification support
- Email login, email verification, and password reset support
- Push notification registration foundation
- Media uploads through S3-compatible object storage
- Prisma/PostgreSQL backend
- GraphQL API with Apollo Server
- React Native / Expo mobile app
- Light/dark theming foundations
- i18n foundation with German and English strings

## Why This Exists

Most social apps are optimized for endless global feeds. `ciaorelated` is being shaped around a different idea:

- real groups
- local communities
- families and friends
- events and venues
- people nearby
- shared moments that have context

The project can be used as a learning resource, a social media app starter, or a foundation for building an event/community-oriented social network.

## Brand Layer

`ciaorelated` is the open technical core of the project. It contains the shared app architecture, feeds, chats, communities, event/moment logic, deep links, GraphQL backend, and deployment foundations.

The app identity is designed to be configurable. Forks and deployments can use their own app name, URL scheme, domains, icons, splash screen, support address, and store identifiers without rewriting hardcoded strings throughout the codebase.

This is handled through branding and build variables such as `EXPO_PUBLIC_APP_NAME`, `EXPO_PUBLIC_APP_SCHEME`, `EXPO_PUBLIC_FEED_HEADER_TEXT`, `EXPO_PUBLIC_WEBSITE_URL`, `EXPO_ICON_PATH`, and `EXPO_SPLASH_IMAGE_PATH`.

## Tech Stack

### Mobile App

- React Native
- Expo
- TypeScript
- Apollo Client
- React Navigation
- Expo Image / Media / Notifications
- i18next

### Backend

- Node.js
- TypeScript
- Apollo Server
- GraphQL
- Prisma
- PostgreSQL
- JWT authentication
- SendGrid-compatible email integration
- Twilio Verify-compatible phone verification
- S3-compatible media storage

### Monorepo

- pnpm workspace
- `apps/ciaorelated` mobile app
- `apps/ciaorelated-landing` static landing/deep-link website
- `apps/server` GraphQL backend
- `packages/shared` shared package placeholder/foundation

## Project Structure

```txt
.
├── apps
│   ├── ciaorelated        # React Native / Expo mobile app
│   ├── ciaorelated-landing # Static landing/deep-link website
│   └── server             # Node.js GraphQL API
├── packages
│   └── shared             # Shared package workspace
├── .github
│   └── workflows          # Optional deploy workflow
├── pnpm-workspace.yaml
└── README.md
```

## Getting Started

### Requirements

- Node.js 22.x for the workspace/backend
- pnpm 10.x
- PostgreSQL
- Expo tooling
- iOS Simulator, Android Emulator, Expo Go, or an Expo development build

Recommended:

```bash
node -v
pnpm -v
```

Install dependencies:

```bash
pnpm install
```

## Environment Variables

This project intentionally does not commit real `.env` files.

Copy the examples:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/ciaorelated/.env.example apps/ciaorelated/.env
```

### Server Env

`apps/server/.env`

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ciaorelated?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
HOST="0.0.0.0"
PORT="4000"
CORS_ORIGINS="http://localhost:3000,http://localhost:5173"
CLIENT_ORIGIN="http://localhost:3000"
CURRENT_TERMS_VERSION="1"
NOMINATIM_EMAIL=""

APP_IOS_MIN_SUPPORTED_VERSION=""
APP_IOS_LATEST_VERSION=""
APP_IOS_STORE_URL=""
APP_ANDROID_MIN_SUPPORTED_VERSION=""
APP_ANDROID_LATEST_VERSION=""
APP_ANDROID_STORE_URL=""

SENDGRID_API_KEY=""
EMAIL_FROM="ciaorelated <noreply@example.com>"

SMS_PROVIDER="console"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_VERIFY_SERVICE_SID=""

S3_BUCKET=""
S3_REGION="eu-north-1"
S3_ENDPOINT=""
S3_FORCE_PATH_STYLE="false"
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_PUBLIC_BASE=""
SIGNED_URL_TTL_SECONDS="900"

AWS_REGION="eu-north-1"
AWS_S3_BUCKET=""

MAX_AVATAR_BYTES="5242880"
MAX_UPLOAD_BYTES="104857600"
MAX_POST_IMAGE_BYTES="10485760"
MAX_POST_VIDEO_BYTES="104857600"
MAX_STORY_UPLOAD_BYTES="83886080"

ENABLE_VIDEO_WORKER="false"
ENABLE_IMAGE_WORKER="false"
ENABLE_STORY_WORKER="false"
ENABLE_AVATAR_WORKER="false"
ENABLE_VLOG_COVER_WORKER="false"
ENABLE_DAILY_DIGEST="false"

TMPDIR=""
FFMPEG_PATH="/usr/local/bin/ffmpeg"
FFPROBE_PATH="/usr/local/bin/ffprobe"
```

Phone login works in development without Twilio by logging verification codes to the server console. To send real SMS messages, configure Twilio Verify.

Server variables at a glance:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma. |
| `JWT_SECRET` | Yes | Secret used to sign authentication tokens. Use a long random value in production. |
| `HOST` | No | Bind host for the HTTP server. Defaults to `0.0.0.0`. |
| `PORT` | No | API port. Defaults to `4000`. |
| `CORS_ORIGINS` | Recommended | Comma-separated list of allowed web origins. Localhost and LAN origins are allowed by default patterns. |
| `CLIENT_ORIGIN` | Optional | Legacy/client origin value for deployments that expect it. |
| `CURRENT_TERMS_VERSION` | Optional | Current terms version shown by the terms gate. Defaults to `1`. |
| `NOMINATIM_EMAIL` | Recommended | Contact email for Nominatim/OpenStreetMap geocoding requests. |
| `APP_IOS_MIN_SUPPORTED_VERSION` | Optional | Minimum iOS app version allowed by the remote update gate. |
| `APP_IOS_LATEST_VERSION` | Optional | Latest iOS app version shown by the remote update gate. |
| `APP_IOS_STORE_URL` | Optional | iOS App Store URL used by the update gate. |
| `APP_ANDROID_MIN_SUPPORTED_VERSION` | Optional | Minimum Android app version allowed by the remote update gate. |
| `APP_ANDROID_LATEST_VERSION` | Optional | Latest Android app version shown by the remote update gate. |
| `APP_ANDROID_STORE_URL` | Optional | Play Store URL used by the update gate. |
| `SENDGRID_API_KEY` | Optional | Enables email verification/password reset emails. |
| `EMAIL_FROM` | Optional | From address for outgoing emails. |
| `SMS_PROVIDER` | Optional | Set to `console` for local code logging. |
| `TWILIO_ACCOUNT_SID` | Optional | Required for real SMS via Twilio Verify. |
| `TWILIO_AUTH_TOKEN` | Optional | Required for real SMS via Twilio Verify. |
| `TWILIO_VERIFY_SERVICE_SID` | Optional | Required for real SMS via Twilio Verify. |
| `S3_BUCKET` | Required for uploads | Bucket/container name for media storage. |
| `S3_REGION` | Required for uploads | S3-compatible storage region. |
| `S3_ENDPOINT` | Required for non-AWS S3 | Endpoint for providers like DigitalOcean Spaces, Cloudflare R2, or MinIO. |
| `S3_FORCE_PATH_STYLE` | Provider-dependent | Use `true` for MinIO/some S3-compatible providers. |
| `S3_ACCESS_KEY_ID` | Required for uploads | Access key for object storage. |
| `S3_SECRET_ACCESS_KEY` | Required for uploads | Secret key for object storage. |
| `S3_PUBLIC_BASE` | Recommended | Public base URL for uploaded chat/media files. |
| `SIGNED_URL_TTL_SECONDS` | Optional | Expiration time for signed upload URLs. |
| `AWS_REGION` | Compatibility | Legacy AWS-style region used by some helpers. |
| `AWS_S3_BUCKET` | Compatibility | Legacy AWS-style bucket used by some helpers. |
| `MAX_*_BYTES` | Optional | Upload size limits. |
| `ENABLE_*_WORKER` | Optional | Enables background workers for thumbnails, video, digest jobs. |
| `TMPDIR` | Optional | Temporary directory for workers. |
| `FFMPEG_PATH` / `FFPROBE_PATH` | Optional | Paths used by the video worker. |

For multiple branded app instances on the same server, prefix update variables with the public app slug in uppercase. For example, if `EXPO_PUBLIC_APP_SLUG=songverwandt`:

```env
APP_SONGVERWANDT_IOS_MIN_SUPPORTED_VERSION="1.1.0"
APP_SONGVERWANDT_IOS_LATEST_VERSION="1.1.0"
APP_SONGVERWANDT_IOS_STORE_URL="https://apps.apple.com/app/id6751941066"
APP_SONGVERWANDT_ANDROID_MIN_SUPPORTED_VERSION="1.1.0"
APP_SONGVERWANDT_ANDROID_LATEST_VERSION="1.1.0"
APP_SONGVERWANDT_ANDROID_STORE_URL="https://play.google.com/store/apps/details?id=com.dogankaraarslan1.songverwandt"
```

### Mobile Env

`apps/ciaorelated/.env`

```env
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:4000/graphql
EXPO_PUBLIC_WEBSITE_URL=https://your-domain.example
EXPO_PUBLIC_ONELINK_URL=
EXPO_PUBLIC_APP_NAME=ciaorelated
EXPO_PUBLIC_APP_SLUG=ciaorelated
EXPO_PUBLIC_APP_SCHEME=ciaorelated
EXPO_PUBLIC_FEED_HEADER_TEXT=ciao
EXPO_PUBLIC_QR_CENTER_TEXT=ciaorelated
EXPO_PUBLIC_SUPPORT_EMAIL=support@example.com
EXPO_PUBLIC_ASSOCIATED_DOMAINS=your-domain.example,www.your-domain.example
EXPO_PUBLIC_IOS_APP_STORE_ID=
EXPO_PUBLIC_APPSFLYER_DEV_KEY=
EXPO_PUBLIC_APPSFLYER_ENABLED=false
EXPO_OWNER=
EXPO_IOS_BUNDLE_IDENTIFIER=com.example.ciaorelated
EXPO_ANDROID_PACKAGE=com.example.ciaorelated
EXPO_ICON_PATH=./assets/cr.png
EXPO_WEB_FAVICON_PATH=./assets/cr.png
EXPO_SPLASH_IMAGE_PATH=./assets/splash-icon.png
EXPO_SPLASH_BACKGROUND_COLOR=#ffffff
EAS_PROJECT_ID=
```

For a real phone on the same Wi-Fi, use your computer's LAN IP, not `localhost`.

Example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:4000/graphql
```

For iOS Simulator, `localhost` may work. For a physical device, `localhost` points to the device itself.

Mobile variables at a glance:

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | Yes | GraphQL API URL used by the mobile app. |
| `EXPO_PUBLIC_WEBSITE_URL` | Recommended | Public website base URL used for invite links, legal pages, and Universal Link prefixes. |
| `EXPO_PUBLIC_ONELINK_URL` | Optional | AppsFlyer OneLink base URL accepted as a trusted incoming link source. |
| `EXPO_PUBLIC_APP_NAME` | Optional | Display name used by Expo config and brand-aware UI text. Defaults to `ciaorelated`. |
| `EXPO_PUBLIC_APP_SLUG` | Optional | Expo project slug. Defaults to `ciaorelated`. |
| `EXPO_PUBLIC_APP_SCHEME` | Optional | Custom app URL scheme. Defaults to `ciaorelated`. |
| `EXPO_PUBLIC_FEED_HEADER_TEXT` | Optional | Short Pacifico wordmark shown in the feed header. Defaults to `ciao`. |
| `EXPO_PUBLIC_QR_CENTER_TEXT` | Optional | Center text shown in generated invite QR share images. Defaults to `ciaorelated`. |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | Optional | Support email used by brand-aware app surfaces. Defaults to `support@example.com`. |
| `EXPO_PUBLIC_ASSOCIATED_DOMAINS` | Recommended for production | Comma-separated Universal Link / Android App Link domains, e.g. `example.com,www.example.com,link.example.com`. The app config also includes hosts from `EXPO_PUBLIC_WEBSITE_URL` and `EXPO_PUBLIC_ONELINK_URL`. |
| `EXPO_PUBLIC_IOS_APP_STORE_ID` | Optional | iOS App Store ID used by update/deep-link helpers. |
| `EXPO_PUBLIC_APPSFLYER_DEV_KEY` | Optional | AppsFlyer key if you use AppsFlyer deep links. |
| `EXPO_PUBLIC_APPSFLYER_ENABLED` | Optional | Set to `true` only in builds where AppsFlyer should initialize. Defaults to `false`. |
| `EXPO_OWNER` | Optional | Expo account/organization owner. |
| `EXPO_IOS_BUNDLE_IDENTIFIER` | Recommended for builds | iOS bundle identifier. |
| `EXPO_ANDROID_PACKAGE` | Recommended for builds | Android package name. |
| `EXPO_ICON_PATH` | Optional | App icon path used by Expo config. Defaults to `./assets/cr.png`. |
| `EXPO_WEB_FAVICON_PATH` | Optional | Web favicon path used by Expo config. Defaults to the app icon path. |
| `EXPO_SPLASH_IMAGE_PATH` | Optional | Splash image path used by Expo config. Defaults to `./assets/splash-icon.png`. |
| `EXPO_SPLASH_BACKGROUND_COLOR` | Optional | Splash screen background color. Defaults to `#ffffff`. |
| `EAS_PROJECT_ID` | Optional | Needed for Expo push tokens and EAS-linked builds. Forks should create their own via EAS. |

Branding-only example for a separate branded deployment:

```env
EXPO_PUBLIC_APP_NAME=YourApp
EXPO_PUBLIC_APP_SLUG=your-app
EXPO_PUBLIC_APP_SCHEME=yourapp
EXPO_PUBLIC_FEED_HEADER_TEXT=YourApp
EXPO_PUBLIC_QR_CENTER_TEXT=YourApp
EXPO_PUBLIC_WEBSITE_URL=https://your-domain.example
EXPO_PUBLIC_SUPPORT_EMAIL=support@your-domain.example
EXPO_IOS_BUNDLE_IDENTIFIER=com.example.yourapp
EXPO_ANDROID_PACKAGE=com.example.yourapp
EXPO_ICON_PATH=./assets/your-app-icon.png
EXPO_WEB_FAVICON_PATH=./assets/your-app-favicon.png
EXPO_SPLASH_IMAGE_PATH=./assets/your-app-splash.png
EXPO_SPLASH_BACKGROUND_COLOR=#ffffff
```

### EAS Builds

`apps/ciaorelated/eas.json` is intentionally configured to use EAS Environment Variables instead of hardcoding deployment-specific URLs, brand names, or store identifiers in the repository.

For production builds, create the values above in the Expo dashboard under:

```txt
Project -> Environment Variables -> production
```

Use plain-text visibility for public build values such as API URL, app name, scheme, domains, icon paths, and bundle identifiers. Use sensitive visibility for provider keys such as `EXPO_PUBLIC_APPSFLYER_DEV_KEY`. Values prefixed with `EXPO_PUBLIC_` are still embedded in the mobile app bundle, so they should not be treated as server secrets.

If your local shell does not load a `.env` file while EAS is resolving the project, pass the project identity values inline:

```bash
EAS_PROJECT_ID=your-eas-project-id \
EXPO_OWNER=your-expo-owner \
EXPO_PUBLIC_APP_SLUG=your-app-slug \
EXPO_PUBLIC_APP_NAME=YourAppName \
EXPO_PUBLIC_APP_SCHEME=your-scheme \
npx eas-cli build --platform ios --profile production
```

For an iOS App Store build:

```bash
npx eas-cli build --platform ios --profile production
```

Submit the latest successful iOS build:

```bash
npx eas-cli submit --platform ios --latest --profile production
```

For Android, use a preview APK before submitting to the Play Store:

```bash
npx eas-cli build --platform android --profile preview
```

Use the production Android profile only for Play Store app bundles:

```bash
npx eas-cli build --platform android --profile production
```

Increase `expo.version` in `apps/ciaorelated/app.config.js` when you want a user-visible app version change. EAS can auto-increment build numbers for repeated uploads of the same version.

## Where To Get Provider Values

### PostgreSQL

For local development, install PostgreSQL and create a database:

```bash
createdb ciaorelated
```

Then set:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/ciaorelated?schema=public"
```

For production, use a managed PostgreSQL database from your host or a provider such as DigitalOcean, Neon, Supabase, Railway, Render, or AWS RDS.

### Twilio Verify

Twilio is only needed for real SMS codes. Local development can use `SMS_PROVIDER="console"`.

To send real SMS:

1. Create a Twilio account.
2. Create a Verify Service.
3. Copy:
   - Account SID to `TWILIO_ACCOUNT_SID`
   - Auth Token to `TWILIO_AUTH_TOKEN`
   - Verify Service SID to `TWILIO_VERIFY_SERVICE_SID`

### SendGrid

SendGrid is used for email verification and password reset emails.

1. Create a SendGrid API key.
2. Verify a sender/domain.
3. Set:
   - `SENDGRID_API_KEY`
   - `EMAIL_FROM`

### S3-Compatible Storage

Media uploads require S3-compatible object storage.

Common providers:

- AWS S3
- DigitalOcean Spaces
- Cloudflare R2
- MinIO

Set the bucket, region, endpoint, access key, secret key, and public base URL in the `S3_*` variables.

### Expo / EAS

Push notifications and EAS builds need an Expo/EAS project.

Create one with:

```bash
eas init
```

Then set the generated project ID:

```env
EAS_PROJECT_ID=your-eas-project-id
```

Forks should use their own EAS project ID, not one from another deployment.

### Deep Links / AppsFlyer OneLink

The app can use regular web invite links and AppsFlyer OneLink links.

Default invite URL shape:

```txt
https://your-domain.example/join?slug=GROUP_SLUG
```

Default app scheme URL shape:

```txt
ciaorelated://join?slug=GROUP_SLUG
```

Supported incoming invite formats:

```txt
https://your-domain.example/join?slug=GROUP_SLUG
https://your-domain.example/join/GROUP_SLUG
ciaorelated://join?slug=GROUP_SLUG
ciaorelated://join/GROUP_SLUG
https://link.your-domain.example/...?...&deep_link_sub1=GROUP_SLUG
```

For production Universal Links / Android App Links:

1. Set mobile env:
   ```env
   EXPO_PUBLIC_WEBSITE_URL=https://your-domain.example
   EXPO_PUBLIC_ONELINK_URL=https://link.your-domain.example
   EXPO_PUBLIC_APP_SCHEME=ciaorelated
   EXPO_PUBLIC_ASSOCIATED_DOMAINS=your-domain.example,www.your-domain.example,link.your-domain.example
   ```
2. Deploy iOS association on every Universal Link domain. If you use the
   bundled landing site, place it in
   `apps/ciaorelated-landing/public/.well-known/`; otherwise place it in the
   static/public folder of the site or CDN serving your domain:
   ```txt
   /.well-known/apple-app-site-association
   ```
   Use your real Apple Team ID and bundle identifier, for example:
   ```json
   {
     "applinks": {
       "apps": [],
       "details": [
         {
           "appID": "APPLE_TEAM_ID.com.example.ciaorelated",
           "paths": ["/join", "/join/*"]
         }
       ]
     }
   }
   ```
   This file is intentionally public and does not contain secrets. It does,
   however, identify the iOS app that is allowed to open links for the domain,
   so replace any example or deployment-specific IDs before publishing your own
   app.
3. Deploy Android association on every Android App Link domain. If you use the
   bundled landing site, place it in
   `apps/ciaorelated-landing/public/.well-known/`; otherwise place it in the
   static/public folder of the site or CDN serving your domain:
   ```txt
   /.well-known/assetlinks.json
   ```
   Use your real Android package name and release signing certificate SHA-256:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.example.ciaorelated",
         "sha256_cert_fingerprints": ["SHA256:RELEASE_CERTIFICATE_FINGERPRINT"]
       }
     }
   ]
   ```
   Use the SHA-256 from the **App signing key certificate** in Google Play
   Console, not the upload key certificate. For Play-distributed builds this is
   available under Release/Setup -> App integrity/App signing after Play App
   Signing is enabled.

Do not treat `.well-known/apple-app-site-association` or
`.well-known/assetlinks.json` as secret files. They must be publicly reachable
over HTTPS without redirects. What matters is that they are accurate for your
own domain, bundle identifier, package name, and signing certificate.

Landing website env example:

```env
VITE_PUBLIC_APP_SCHEME=ciaorelated
VITE_PUBLIC_ONELINK_URL=https://link.your-domain.example/TEMPLATE_ID/invite
VITE_PUBLIC_IOS_STORE_URL=https://apps.apple.com/app/idYOUR_APP_ID
VITE_PUBLIC_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.example.ciaorelated
```

If you use AppsFlyer, create your own OneLink setup instead of reusing another deployment's domain or keys.

Recommended AppsFlyer setup:

1. Create or select an AppsFlyer app.
2. Create a OneLink template for the mobile app.
3. Configure app launch methods in the template:
   - Universal Links for your public domain, for example `your-domain.example`
   - URI scheme fallback:
     ```txt
     ciaorelated://join?slug={deep_link_sub1}
     ```
4. Optional but recommended: add a branded domain such as:
   ```txt
   link.your-domain.example
   ```
5. In your DNS provider, point the branded domain to the AppsFlyer CNAME destination shown by AppsFlyer:
   ```txt
   link CNAME your-appsflyer-customlinks-target.example.
   ```
6. Configure the OneLink/custom link deep-link parameters:
   ```txt
   deep_link_value=join
   deep_link_sub1=GROUP_SLUG
   ```
7. Configure fallbacks:
   - iOS not installed: App Store
   - Android not installed: Play Store or website
   - Desktop: your website or `/join?slug={deep_link_sub1}`

Example AppsFlyer link shape:

```txt
https://link.your-domain.example/TEMPLATE_ID/invite?deep_link_value=join&deep_link_sub1=GROUP_SLUG
```

Mobile env example:

```env
EXPO_PUBLIC_WEBSITE_URL=https://your-domain.example
EXPO_PUBLIC_ONELINK_URL=https://link.your-domain.example
EXPO_PUBLIC_APP_SCHEME=ciaorelated
EXPO_PUBLIC_ASSOCIATED_DOMAINS=your-domain.example,www.your-domain.example,link.your-domain.example
EXPO_PUBLIC_APPSFLYER_ENABLED=true
EXPO_PUBLIC_APPSFLYER_DEV_KEY=your-appsflyer-dev-key
EXPO_PUBLIC_IOS_APP_STORE_ID=your-apple-app-id
```

For local development, keep AppsFlyer disabled:

```env
EXPO_PUBLIC_APPSFLYER_ENABLED=false
```

### Testing Invite Links Locally

You do not need AppsFlyer or a public website to test community invite links during local development.

If you use a development build with the app scheme installed, open the invite directly with the local scheme:

```bash
npx uri-scheme open "ciaorelated://join/GROUP_SLUG" --ios
npx uri-scheme open "ciaorelated://join?slug=GROUP_SLUG" --ios
```

For Android development builds, use the same URLs with `--android`:

```bash
npx uri-scheme open "ciaorelated://join/GROUP_SLUG" --android
npx uri-scheme open "ciaorelated://join?slug=GROUP_SLUG" --android
```

Expo Go support for custom invite deep links can vary by SDK, network mode, and client. If you still want to try it, start the app through the normal Expo QR code first, then use Expo's local deep-link format:

```txt
exp://YOUR_LAN_IP:8081/--/join/GROUP_SLUG
```

Example with documentation-only placeholder values:

```txt
exp://192.0.2.10:8081/--/join/GROUP_SLUG
```

In other words:

- `https://your-domain.example/join?slug=GROUP_SLUG` tests your website / Universal Link fallback.
- `ciaorelated://join/GROUP_SLUG` tests the installed app scheme in a development build.
- `exp://YOUR_LAN_IP:8081/--/join/GROUP_SLUG` may work in Expo Go, but a development build is the reliable local path for custom scheme testing.

When AppsFlyer is disabled, the app still accepts regular links such as `ciaorelated://join?slug=GROUP_SLUG` and `https://your-domain.example/join?slug=GROUP_SLUG`.

The mobile parser also accepts AppsFlyer-style slug parameters:

```txt
deep_link_sub1
af_sub1
sub1
```

The static website includes `/join`, `/join/$slug`, and a placeholder `public/deep-link.js`. Wire that script to your own store URLs and app scheme before using it as a production web fallback.

## Database Setup

Create a PostgreSQL database:

```bash
createdb ciaorelated
```

Then apply Prisma migrations:

```bash
pnpm --dir apps/server exec prisma migrate deploy
```

`migrate deploy` is non-interactive and applies the committed migrations. This is the recommended setup command for a fresh clone.

If you are actively developing Prisma schema changes and want Prisma to create a new migration, use:

```bash
pnpm --dir apps/server exec prisma migrate dev
```

Generate Prisma Client:

```bash
pnpm --dir apps/server exec prisma generate
```

## Run The Backend

```bash
pnpm --dir apps/server dev
```

The GraphQL API runs by default at:

```txt
http://localhost:4000/graphql
```

For a physical phone, the app should point to:

```txt
http://YOUR_LAN_IP:4000/graphql
```

## Run The Mobile App

For iOS Simulator or Android Emulator on the same machine:

```bash
pnpm --dir apps/ciaorelated start:local
```

For a physical phone on the same Wi-Fi:

```bash
pnpm --dir apps/ciaorelated start:device
```

Or, from the app folder:

```bash
cd apps/ciaorelated
npx expo start -c
```

If you are testing on a physical phone, make sure `EXPO_PUBLIC_API_URL` uses your LAN IP.

If the app logs `Network request failed`, verify that the backend is running and that `EXPO_PUBLIC_API_URL` points to a reachable GraphQL endpoint:

```bash
curl -H "content-type: application/json" \
  --data '{"query":"query { __typename }"}' \
  http://YOUR_LAN_IP:4000/graphql
```

## Phone Auth

The app supports phone login/registration with verification codes.

Development behavior:

- If Twilio env vars are missing, codes are printed in the server console.
- If Twilio env vars are set, the server uses Twilio Verify.

Required Twilio variables:

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
```

## Email Auth

Email-related flows can use SendGrid-compatible configuration:

```env
SENDGRID_API_KEY=
EMAIL_FROM=
```

In local development, if SendGrid is not configured or the key is invalid, verification and password reset codes are printed to the server console.

Expected development log format:

```txt
[email][DEV] VERIFY CODE to user@example.com code: 123456
```

## Media Uploads

The backend is designed for S3-compatible object storage. Configure this before testing photo/video posts, profile avatars, chat media, or any flow that requests signed upload URLs.

Typical variables:

```env
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE=
```

Use a provider such as AWS S3, DigitalOcean Spaces, Cloudflare R2, MinIO, or another S3-compatible storage service.

For a minimal local smoke test you can leave S3 empty, but upload mutations will fail until these values point to a real bucket/container.

## Development Checks

Useful checks after installation:

```bash
pnpm --filter "{./apps/server}" build
```

The backend build should pass after dependencies and environment variables are configured.

The mobile TypeScript check is still being cleaned up for open-source contributor workflows. Known current issues include a missing `react-native-fs` type/module reference and a small set of existing React Native style/type mismatches.

## App Store Review Notes

A reusable App Store review notes template is available at:

[`docs/app-store-review-notes.md`](./docs/app-store-review-notes.md)

It documents user-generated content moderation, reporting/blocking flows, privacy permissions, account deletion, and reviewer test account placeholders.

## Deployment

This repository includes an example GitHub Actions deploy workflow in:

```txt
.github/workflows/deploy.yml
```

It expects these GitHub repository secrets:

```txt
SERVER_SSH_KEY
SERVER_USER
SERVER_HOST
SERVER_PATH
```

The target server should already have:

- Node.js / pnpm support
- PM2 or access to `npx pm2`
- a production `.env` or `.env.production`
- a reachable PostgreSQL database
- required production env vars

The workflow is intended as a starting point. Forks should adapt it to their own hosting setup.

## Open Source Notes

This repository is intentionally neutral:

- no committed production `.env`
- no committed local database
- no committed `node_modules`
- no hardcoded EAS project ID
- no hardcoded production secrets
- no hardcoded production website domain

Each fork should configure its own:

- app identifiers
- EAS project
- push notification setup
- backend URL
- database
- SMS provider
- email provider
- object storage provider

## Roadmap Ideas

- stronger event/community feeds
- organization and venue profiles
- better local discovery filters
- event-based people discovery
- improved group chat/community relationship
- richer moderation tools
- contact discovery with privacy-preserving matching
- production-ready screenshot and demo data
- web landing page and deep-link pages
- production Universal Links / App Links configuration

## Keywords

React Native social media app, Expo social app, Instagram clone, Instagram-style app, GraphQL social network, Prisma PostgreSQL app, group chat app, event community app, local discovery app, open-source social network, mobile social media starter, full-stack React Native app.

## Follow

Follow the project on social media:

- Instagram: [@ciaorelated](https://instagram.com/ciaorelated)
- TikTok: [@ciaorelated](https://www.tiktok.com/@ciaorelated)
- LinkedIn: [ciaorelated](https://www.linkedin.com/company/ciaorelated)

## License

The source code in this repository is licensed under the MIT License. See [LICENSE](./LICENSE).

Brand assets are separate from the code license. The `ciaorelated` name, logo, screenshots, App Store assets, social media handles, domains, and other brand materials are not automatically granted for trademark, commercial branding, or app-store identity use. Forks and derivative apps should use their own name, icons, store listings, domains, screenshots, and brand identity unless explicit permission is granted.

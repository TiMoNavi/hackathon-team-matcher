# ciaorelated Landing

Static landing and deep-link website for `ciaorelated`.

## Routes

- `/`
- `/join?slug=abc123`
- `/support.html`
- `/privacy.html`
- `/privacy-de.html`
- `/datenschutz.html`
- `/terms.html`
- `/terms-de.html`
- `/guidelines.html`
- `/guidelines-de.html`
- `/kampagne.html`

## Development

```bash
pnpm --dir apps/ciaorelated-landing dev
```

## Build

```bash
pnpm --dir apps/ciaorelated-landing build
```

Static output:

```txt
apps/ciaorelated-landing/.output/public
```

## Branding Env

All deployment-specific app, store, legal, and link values are controlled by
`VITE_PUBLIC_*` variables. Copy `.env.example` to `.env` for local testing or
set these variables in your hosting provider.

```env
VITE_PUBLIC_APP_NAME=ciaorelated
VITE_PUBLIC_WORDMARK=ciaorelated
VITE_PUBLIC_TAGLINE=Social moments for real communities.
VITE_PUBLIC_WEBSITE_URL=https://your-domain.example
VITE_PUBLIC_SUPPORT_EMAIL=support@your-domain.example
VITE_PUBLIC_COPYRIGHT_NAME=ciaorelated
VITE_PUBLIC_LEGAL_ENTITY=ciaorelated
VITE_PUBLIC_LEGAL_ADDRESS=
VITE_PUBLIC_GITHUB_REPO_URL=https://github.com/dogankaraarslan1/ciaorelated
VITE_PUBLIC_FAVICON_URL=/favicon.png
VITE_PUBLIC_APPLE_TOUCH_ICON_URL=/favicon.png
VITE_PUBLIC_APP_SCHEME=ciaorelated
VITE_PUBLIC_ONELINK_URL=
VITE_PUBLIC_IOS_STORE_URL=
VITE_PUBLIC_ANDROID_STORE_URL=
```

Beverly deployment example:

```env
VITE_PUBLIC_APP_NAME=Beverly
VITE_PUBLIC_WORDMARK=Beverly
VITE_PUBLIC_TAGLINE=Social moments for real communities.
VITE_PUBLIC_WEBSITE_URL=https://bvrly.app
VITE_PUBLIC_SUPPORT_EMAIL=info@ciaorelated.com
VITE_PUBLIC_COPYRIGHT_NAME=Beverly
VITE_PUBLIC_LEGAL_ENTITY=Apparrivederci
VITE_PUBLIC_LEGAL_ADDRESS=Schratten 56, 5441 Abtenau
VITE_PUBLIC_GITHUB_REPO_URL=https://github.com/dogankaraarslan1/ciaorelated
VITE_PUBLIC_FAVICON_URL=/favicon.png
VITE_PUBLIC_APPLE_TOUCH_ICON_URL=/favicon.png
VITE_PUBLIC_APP_SCHEME=beverly
VITE_PUBLIC_ONELINK_URL=https://bvrly.onelink.me
VITE_PUBLIC_IOS_STORE_URL=https://apps.apple.com/at/app/beverly/id6751941066
VITE_PUBLIC_ANDROID_STORE_URL=
```

`robots.txt` and `sitemap.xml` are generated from `VITE_PUBLIC_WEBSITE_URL`
during `pnpm --dir apps/ciaorelated-landing build`.

## Deep Links

The mobile app currently generates invite links in this form:

```txt
/join?slug=abc123
```

The join page keeps query parameters intact and exposes these DOM IDs for the production deep-link script:

- `statusText`
- `slugText`
- `openApp`
- `copyBtn`
- `appStoreBtn`

Production deep-link logic belongs in `public/deep-link.js`.

Universal Links can be added later in `public/.well-known/apple-app-site-association` once the real iOS team ID and bundle ID are known.

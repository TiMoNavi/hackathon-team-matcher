#!/usr/bin/env bash
set -euxo pipefail

# pnpm bereitstellen (ohne Corepack-Ärger)
if ! command -v pnpm >/dev/null 2>&1; then
  npm i -g pnpm@8.15.6
fi

pnpm -v
pnpm config set store-dir ~/.pnpm-store

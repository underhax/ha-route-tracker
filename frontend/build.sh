#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env npm_config_cache=/tmp/npm-cache \
  --volume "$project_root:/repo" \
  --workdir /repo/frontend \
  node:26-alpine3.24@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36 \
  sh -c "npm ci --ignore-scripts && npm run build"

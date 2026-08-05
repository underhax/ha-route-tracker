# Route Tracker Development and Verification

## Prerequisites

- Git
- Python 3.14
- uv
- Node.js 26 with npm
- GNU Make
- Docker for `make build-docker` only

`direnv` is optional. If you use it, configure your local environment to activate `.venv` automatically.

## Setup

```sh
git clone https://github.com/underhax/ha-route-tracker
cd ha-route-tracker
make install
```

Activate the Python virtual environment before running Python targets unless your local `direnv` configuration already does so:

```sh
source .venv/bin/activate
```

## Make Targets

| Command | Description |
| --- | --- |
| `make install` | Creates or reuses `.venv`, installs Python test dependencies, and installs frontend dependencies without lifecycle scripts. |
| `make build` | Builds the production frontend into `custom_components/route_tracker/www/`. |
| `make build-docker` | Builds the production frontend in the pinned Docker Node image. |
| `make lint` | Runs the frontend TypeScript type check without writing output files. |
| `make frontend-bundle-check` | Builds the frontend in a temporary directory without modifying `www/`. |
| `make frontend-check` | Installs frontend dependencies, checks types and the dependency tree, audits all and production dependencies, and verifies a temporary production bundle. |
| `make check` | Checks Python formatting, Ruff diagnostics, mypy, and Basedpyright. |
| `make test` | Runs the Python test suite. |
| `make verify` | Runs frontend checks, Python checks, and tests. |

Use `make verify` before opening a pull request.

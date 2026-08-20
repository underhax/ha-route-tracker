# Route Tracker Development and Verification

## Prerequisites

- Git
- Python 3.14
- uv
- Node.js 26 with npm
- Biome (required for strict frontend linting and formatting)
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

Biome must be installed prior to executing local code validation. Please refer to [the official documentation](https://biomejs.dev/guides/getting-started/#installation) for supported installation methods.

## Make Targets

| Command | Description |
| --- | --- |
| `make install` | Creates or reuses `.venv`, installs Python test dependencies, and installs frontend dependencies without lifecycle scripts. |
| `make frontend-biome` | Executes Biome strict linting and formatting checks. |
| `make frontend-biome-fix` | Automatically fixes Biome formatting and safely fixable linting issues. |
| `make frontend-check` | Installs frontend dependencies, checks types and the dependency tree, audits all and production dependencies, and verifies a temporary production bundle. |
| `make frontend-test` | Runs the frontend test suite using Vitest. |
| `make frontend-coverage` | Runs the frontend test suite and generates a coverage report. |
| `make integration-check` | Checks Python formatting, Ruff diagnostics, mypy, and Basedpyright. |
| `make integration-test` | Runs the Python test suite. |
| `make verify` | Runs frontend checks, Python checks, and tests. |
| `make frontend-build` | Builds the production frontend into `custom_components/route_tracker/www/`. |
| `make frontend-build-docker` | Builds the production frontend in the pinned Docker Node image. |

Use `make verify` before opening a pull request.

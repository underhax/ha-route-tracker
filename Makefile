.PHONY: install frontend-biome frontend-biome-fix frontend-check frontend-test frontend-outdated frontend-outdated-all frontend-coverage integration-check integration-test integration-outdated verify frontend-build frontend-build-docker

install:
	uv venv --allow-existing
	uv pip install -r .github/requirements_test.txt
	npm --prefix frontend ci --ignore-scripts

frontend-biome:
	biome ci frontend/

frontend-biome-fix:
	biome check --write frontend/src

frontend-check:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend exec -- tsc --project frontend/tsconfig.json --noEmit
	npm --prefix frontend ls --all
	npm --prefix frontend audit
	npm --prefix frontend audit --omit=dev
	output_dir=$$(mktemp -d); \
	trap 'rm -rf "$$output_dir"' EXIT; \
	cd frontend && npx --no-install vite build --outDir "$$output_dir" --emptyOutDir

frontend-test:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend test

frontend-coverage:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend run coverage

frontend-outdated-all:
	npm --prefix frontend outdated --all

frontend-outdated:
	npm --prefix frontend outdated

integration-check:
	ruff format --check .
	ruff check .
	mypy .
	basedpyright .

integration-test:
	pytest

integration-outdated:
	.venv/bin/pip list --outdated

verify: frontend-biome frontend-check frontend-test integration-check integration-test

frontend-build:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend run build

frontend-build-docker:
	frontend/build.sh

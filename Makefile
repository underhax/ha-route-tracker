.PHONY: install frontend-biome frontend-biome-fix  frontend-check frontend-test integration-check integration-test verify frontend-build frontend-build-docker

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

integration-check:
	ruff format --check .
	ruff check .
	mypy .
	basedpyright .

integration-test:
	pytest

verify: frontend-biome frontend-check frontend-test integration-check integration-test

frontend-build:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend run build

frontend-build-docker:
	frontend/build.sh

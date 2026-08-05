.PHONY: build build-docker check frontend-bundle-check frontend-check frontend-test install lint test verify

build:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend run build

build-docker:
	frontend/build.sh

install:
	uv venv --allow-existing
	uv pip install -r .github/requirements_test.txt
	npm --prefix frontend ci --ignore-scripts

lint:
	npm --prefix frontend exec -- tsc --project frontend/tsconfig.json --noEmit

frontend-check:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend exec -- tsc --project frontend/tsconfig.json --noEmit
	npm --prefix frontend ls --all
	npm --prefix frontend audit
	npm --prefix frontend audit --omit=dev
	$(MAKE) frontend-bundle-check

frontend-test:
	npm --prefix frontend ci --ignore-scripts
	npm --prefix frontend test

frontend-bundle-check:
	output_dir=$$(mktemp -d); \
	trap 'rm -rf "$$output_dir"' EXIT; \
	cd frontend && npx --no-install vite build --outDir "$$output_dir" --emptyOutDir

check:
	ruff format --check .
	ruff check .
	mypy .
	basedpyright .

test:
	pytest

verify: frontend-check frontend-test check test

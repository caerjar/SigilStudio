# Three Musketeers — Make drives Docker Compose drives the tool.
# Non-Docker path: `npm install && npm run dev`.
.PHONY: help dev build install down clean typecheck test check

# The dev server's port, on both sides of the compose mapping and inside
# vite.config.ts. `export` so it reaches docker compose either way you write it:
# `PORT=3000 make dev` arrives as inherited environment, but `make dev PORT=3000`
# is a make variable, and make does not export those to recipes by default.
#
# Default 5180 rather than Vite's 5173, which is a commons — a neighbouring
# stack holding 5173 serves its app at this project's URL and looks like a hang.
PORT ?= 5180
export PORT

help: ## List the targets
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'

# The help text can't name the port — it is grepped out of this file verbatim,
# so $(PORT) would print as literal "$(PORT)". The echo does it instead.
dev: ## Run the Vite dev server in Docker (override the port with PORT=…)
	@echo "Sigil Studio → http://127.0.0.1:$(PORT)"
	docker compose up --build dev

install: ## Install deps inside the image
	docker compose build dev

build: ## Production build (dist/) in a throwaway container
	docker compose run --rm dev npm run build

typecheck: ## Type-check only
	docker compose run --rm dev npm run typecheck

test: ## Run the test suite
	docker compose run --rm dev npm test

check: ## The gate: typecheck + tests
	docker compose run --rm dev npm run check

down: ## Stop and remove containers
	docker compose down

clean: down ## Remove build artifacts
	rm -rf dist

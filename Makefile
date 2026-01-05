PYTHON ?= python3
PIP ?= pip3

.PHONY: help frontend-install frontend-dev frontend-build backend-install backend-dev backend-health tree

help:
	@echo "Available commands:"
	@echo "  make frontend-install Install frontend dependencies"
	@echo "  make frontend-dev     Run Next.js frontend in dev mode"
	@echo "  make frontend-build   Build the frontend"
	@echo "  make backend-install  Install backend dependencies"
	@echo "  make backend-dev      Run FastAPI backend in dev mode"
	@echo "  make backend-health   Check backend /health endpoint"
	@echo "  make tree             Show top-level project structure"

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

backend-install:
	cd backend && $(PIP) install -r requirements.txt

backend-dev:
	cd backend && $(PYTHON) -m uvicorn app.main:app --reload --port 8000

backend-health:
	curl -fsS http://localhost:8000/health

tree:
	find . -maxdepth 2 \( -path './.git' -o -path './demo/outputs' \) -prune -o -print | sort

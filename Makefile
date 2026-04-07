PYTHON ?= python3
PIP ?= pip3

.PHONY: help backend-install backend-dev backend-health tree

help:
	@echo "Available commands:"
	@echo "  make backend-install  Install backend dependencies"
	@echo "  make backend-dev      Run FastAPI backend in dev mode"
	@echo "  make backend-health   Check backend /health endpoint"
	@echo "  make tree             Show top-level project structure"

backend-install:
	cd backend && $(PIP) install -r requirements.txt

backend-dev:
	cd backend && $(PYTHON) -m uvicorn app.main:app --reload --port 8000

backend-health:
	curl -fsS http://localhost:8000/health

tree:
	find . -maxdepth 2 \( -path './.git' -o -path './demo/outputs' \) -prune -o -print | sort


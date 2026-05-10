PYTHON ?= python3
PIP ?= pip3
PORT ?= 3477

.PHONY: help start frontend-install frontend-build backend-install health tree

help:
	@echo "Available commands:"
	@echo "  make start            Build and start TooGraph on one port"
	@echo "  make frontend-install Install frontend dependencies"
	@echo "  make frontend-build   Build the frontend"
	@echo "  make backend-install  Install backend dependencies"
	@echo "  make health           Check TooGraph /health endpoint"
	@echo "  make tree             Show top-level project structure"

start:
	PORT=$(PORT) npm start

frontend-install:
	cd frontend && npm install

frontend-build:
	cd frontend && npm run build

backend-install:
	cd backend && $(PIP) install -r requirements.txt

health:
	curl --noproxy '*' -fsS http://127.0.0.1:$(PORT)/health

tree:
	find . -maxdepth 2 \( -path './.git' -o -path './demo/outputs' \) -prune -o -print | sort

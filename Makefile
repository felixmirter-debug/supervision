ifeq ($(OS),Windows_NT)
SHELL := cmd.exe
.SHELLFLAGS := /D /C
endif

.PHONY: dev stop install backend frontend test-backend type-check-frontend

dev:
	@echo "Starting backend (port 8000) and frontend (port 3000)..."
	@start "supervision-backend" cmd /k "cd /d backend && python -m uvicorn main:app --reload --port 8000"
	@start "supervision-frontend" cmd /k "cd /d frontend && pnpm run dev --port 3000"

stop:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-dev.ps1

install:
	cd backend && pip install -r requirements.txt
	cd frontend && pnpm install

backend:
	cd backend && python -m uvicorn main:app --reload --port 8000

frontend:
	cd frontend && pnpm run dev --port 3000

test-backend:
	cd backend && pytest tests/ -v

type-check-frontend:
	cd frontend && pnpm exec tsc --noEmit

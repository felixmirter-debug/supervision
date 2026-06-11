.PHONY: dev install backend frontend test-backend type-check-frontend

dev:
	@echo "Starting backend (port 8000) and frontend (port 3000)..."
	@start cmd /k "cd backend && uvicorn main:app --reload --port 8000"
	@start cmd /k "cd frontend && npm run dev"

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

backend:
	cd backend && uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test-backend:
	cd backend && pytest tests/ -v

type-check-frontend:
	cd frontend && npx tsc --noEmit

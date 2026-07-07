.PHONY: dev dev-backend dev-frontend install lint test build fmt clean

dev:
	@echo "Starting backend and frontend..."
	$(MAKE) dev-backend &
	$(MAKE) dev-frontend &
	wait

dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

lint:
	ruff check backend/
	ruff format --check backend/
	cd frontend && npm run lint

test:
	cd backend && pytest tests/
	cd frontend && npm run build

build:
	cd frontend && npm run build

fmt:
	ruff format backend/
	cd frontend && npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css}"

clean:
	rm -rf frontend/.next frontend/out
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find backend -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find backend -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find backend -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true

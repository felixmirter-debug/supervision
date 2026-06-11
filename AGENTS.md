# Agent Instructions — CV SaaS

This file provides guidance for all coding agents working in this repository.
See CLAUDE.md for full project context and guidelines.

## Critical Rules

- **Package manager: `pnpm`** — always use pnpm for frontend. Never npm or yarn.
- **Never make commits** — do not run `git commit` unless explicitly asked.
- **Read CLAUDE.md** before starting any task.

## Quick Reference

- Backend: `cd backend && uvicorn main:app --reload --port 8000`
- Frontend: `cd frontend && pnpm dev`
- All tests: `cd backend && pytest tests/ -v`
- Type check: `cd frontend && pnpm tsc --noEmit`

## Project Structure

```
supervision/
├── backend/     FastAPI + supervision + Python
├── frontend/    Next.js 16 + TypeScript + Tailwind
├── supabase/    Migrations SQL
└── docs/        Specs and plans
```

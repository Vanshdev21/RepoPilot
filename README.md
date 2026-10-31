# RepoPilot

RepoPilot is a repository-aware engineering workflow inspired by the product requirements and design specifications in `docs/` and `DESIGN.md`. It includes an Express/MongoDB API and a React/Redux frontend with GSAP motion.

## Run locally

```bash
# Terminal 1
cd backend
npm start

# Terminal 2
cd frontend
npm run dev
```

The frontend is available at `http://localhost:5173`; the API is available at `http://localhost:8001/api`. The backend reads local secrets from `backend/.env`, which is gitignored. Copy any deployment credentials to environment variables rather than source files.

## API

The backend implements the documented repository, issue, agent-run, test, approval, pull-request, report, and health endpoints. Public GitHub repositories are accessed through the server; authentication tokens and secrets are never sent to the frontend.

# RepoPilot

> **From GitHub issue to verified, review-ready pull request.**  
> An AI teammate for every open-source repository.

RepoPilot is an AI-powered open-source development agent designed to help developers understand unfamiliar repositories, investigate GitHub issues, generate code changes, run tests in an isolated environment, and prepare pull requests for human review.

The goal is not simply to generate code. RepoPilot aims to make AI-assisted contributions **understandable, testable, and reviewable**.

> **Project status:** Hackathon prototype in development. The workflow below describes the intended product. Update the feature checklist as implementation progresses.

## Table of contents

- [The problem](#the-problem)
- [Our solution](#our-solution)
- [How it works](#how-it-works)
- [Key features](#key-features)
- [Patch Evidence Report](#patch-evidence-report)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Security](#security)
- [Suggested project structure](#suggested-project-structure)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Team](#team)
- [License](#license)

---

## The problem

Contributing to open-source software can be difficult, especially when a developer is new to a project.

A contributor often needs to understand an unfamiliar codebase, identify the files related to an issue, decide what changes are required, implement the fix, run the correct tests, and prepare a clear pull request.

This process takes time and can discourage new contributors. AI coding tools can generate code, but generated code is not automatically correct. A proposed change needs repository context, validation, and human review.

## Our solution

RepoPilot brings these steps into one guided workflow.

A user connects GitHub, chooses a public repository, and selects an open issue. RepoPilot uses repository context and a Gemma model to investigate the task and propose a patch. The patch can then be checked in an isolated Docker-based test environment. Before anything is published, the user reviews and explicitly approves the changes.

**Our core principle: AI should show its work, not ask developers to trust it blindly.**

## How it works

### 1. Connect GitHub

The user signs in with GitHub and selects a public repository. RepoPilot retrieves repository information needed for the task, such as the README, file tree, and available issues.

### 2. Select an issue

The user chooses an open GitHub issue. Its description becomes the task the agent needs to investigate.

### 3. Understand the repository

The agent examines relevant repository context and identifies files that may be connected to the issue. This helps it reason about the project instead of treating the issue as an isolated prompt.

### 4. Generate a patch

The Gemma-powered agent proposes code changes in a structured patch or diff format. The user can inspect the proposed changes before deciding what to do next.

### 5. Validate in an isolated environment

The proposed patch is applied in a temporary workspace. The intended workflow runs relevant project tests inside an isolated Docker environment and captures the actual command, output, exit status, and execution details.

### 6. Review the evidence

RepoPilot prepares a Patch Evidence Report so the developer can understand what the agent inspected, changed, and tested.

### 7. Approve and create a pull request

Only after the user explicitly approves the proposed patch should RepoPilot proceed with publishing steps, such as creating a branch, committing the changes, and opening a pull request.

**RepoPilot does not automatically merge changes into the original repository. The human developer remains in control.**

## Key features

| Feature                 | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| GitHub integration      | Connect a GitHub account and work with public repositories |
| Repository intelligence | Gather and inspect relevant repository context             |
| Issue analysis          | Turn an issue description into an actionable investigation |
| Gemma-powered agent     | Analyze the task and propose code changes                  |
| Patch generation        | Present proposed changes as a reviewable diff              |
| Isolated test execution | Run project checks in a controlled Docker workspace        |
| Live activity updates   | Show meaningful progress and execution events              |
| Patch Evidence Report   | Present the files, diff, commands, and test results        |
| Human approval          | Require explicit approval before publishing                |
| Pull request creation   | Prepare a review-ready contribution on GitHub              |

_This table describes the product scope. Check the current implementation before treating every item as available._

## Patch Evidence Report

The Patch Evidence Report is a central part of RepoPilot. Instead of displaying only a success message, the report is designed to provide verifiable details about an agent run.

A report may include:

- **Issue:** The GitHub issue being addressed.
- **Inspected files:** Repository files examined during investigation.
- **Changed files:** Files modified by the proposed patch.
- **Diff:** The exact additions and deletions proposed by the agent.
- **Test commands:** Commands actually executed by the test worker.
- **Test output:** Captured output from those commands.
- **Exit status:** The real process exit code.
- **Execution details:** Duration and run status, where available.

A test should only be described as passed when the corresponding command actually ran and returned a successful result. If a test could not run, the report should say so clearly.

## Technology stack

The planned technology choices are:

| Area           | Technology                   | Responsibility                                    |
| -------------- | ---------------------------- | ------------------------------------------------- |
| Frontend       | React, TypeScript, Vite      | User interface                                    |
| Styling        | Tailwind CSS                 | Responsive UI styling                             |
| Animation      | Framer Motion                | Interface motion and transitions                  |
| Icons          | Lucide                       | Interface icons                                   |
| Backend        | Node.js, Express, TypeScript | API and workflow orchestration                    |
| Validation     | Zod                          | Validate API inputs and configuration             |
| GitHub         | GitHub OAuth / Octokit       | Authentication and repository operations          |
| AI             | Gemma model API              | Issue analysis and patch generation               |
| Database       | MongoDB, Mongoose            | Users, repositories, runs, and reports            |
| Test isolation | Docker                       | Execute project checks in an isolated environment |
| Live updates   | Server-Sent Events (SSE)     | Stream agent activity to the frontend             |

The exact libraries and deployment services may change as implementation evolves.

## Architecture

```text
                  +----------------------+
                  |    React Frontend    |
                  | Repository / Issues  |
                  | Diff / Evidence UI   |
                  +----------+-----------+
                             | HTTP / SSE
                             v
                  +----------------------+
                  |   Express Backend    |
                  | Auth + API + Agent   |
                  | Workflow Orchestrator|
                  +-------+--------+-----+
                          |        |
              +-----------+        +-------------+
              v                                  v
     +-----------------+                +-----------------+
     | GitHub / Octokit|                |   Gemma Model   |
     | Repos, Issues,  |                | Issue analysis  |
     | Branches, PRs   |                | Patch proposal  |
     +-----------------+                +-----------------+
                          |
                          v
                  +----------------------+
                  | Temporary Workspace |
                  | Patch application   |
                  +----------+-----------+
                             v
                  +----------------------+
                  | Isolated Docker Test |
                  | Commands + Output    |
                  +----------+-----------+
                             v
                  +----------------------+
                  | Evidence + Approval  |
                  | Human review         |
                  +----------+-----------+
                             v
                  +----------------------+
                  | GitHub Pull Request  |
                  +----------------------+

                  +----------------------+
                  | MongoDB              |
                  | Users, Runs, Reports |
                  +----------------------+
```

### Main backend responsibilities

- Authenticate users and manage GitHub authorization securely.
- Fetch repository and issue information.
- Coordinate the agent workflow.
- Store run state, events, and evidence.
- Validate and apply proposed patches.
- Dispatch test jobs to an isolated worker.
- Enforce ownership checks and explicit approval.
- Publish approved changes to GitHub.

## Getting started

> The commands below are a starting-point template. Adjust folder names and scripts to match the actual repository.

### Prerequisites

- [Node.js](https://nodejs.org/) (a current LTS release is recommended)
- npm
- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [MongoDB](https://www.mongodb.com/) or a MongoDB connection string
- A GitHub account
- Access to the Gemma model API used by the project

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/RepoPilot.git
cd RepoPilot
```

Replace `YOUR-USERNAME` with the GitHub account or organization that owns the repository.

### 2. Install dependencies

If the project has separate frontend and backend folders:

```bash
cd backend
npm install

cd ../frontend
npm install
```

If your repository uses a different structure, follow its actual package scripts and folder layout.

### 3. Configure environment variables

Create the required `.env` file in the backend directory. See the environment variable reference below. Do not commit real credentials or `.env` files.

### 4. Start the development servers

The exact scripts depend on the current `package.json` files. A common setup may look like:

```bash
# Terminal 1: backend
cd backend
npm run dev
```

```bash
# Terminal 2: frontend
cd frontend
npm run dev
```

Open the local frontend URL printed by the Vite development server.

### 5. Start Docker

Open Docker Desktop and confirm that the Docker engine is running before testing any workflow that uses the sandbox worker.

## Environment variables

The following names are illustrative. Keep only variables actually used by the application and update this table to match the code.

| Variable               | Used for                                |
| ---------------------- | --------------------------------------- |
| `PORT`                 | Backend server port                     |
| `FRONTEND_URL`         | Frontend origin for redirects and CORS  |
| `MONGODB_URI`          | MongoDB connection string               |
| `GITHUB_CLIENT_ID`     | GitHub OAuth application client ID      |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth application secret         |
| `GITHUB_CALLBACK_URL`  | OAuth callback URL                      |
| `SESSION_SECRET`       | Session signing secret                  |
| `GEMMA_API_KEY`        | Credential for the configured Gemma API |
| `GEMMA_MODEL`          | Model identifier, if configurable       |

Example placeholder configuration:

```env
PORT=8001
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/repopilot

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:8001/api/auth/github/callback

SESSION_SECRET=replace_with_a_long_random_secret

GEMMA_API_KEY=your_gemma_api_key
GEMMA_MODEL=your_configured_model_id
```

Never paste real secrets into public issues, source code, screenshots, or commits. Add `.env` to `.gitignore`.

## Security

RepoPilot is designed around a human-controlled workflow.

1. **Protect credentials:** Keep GitHub tokens and model API keys on the backend. Never expose them in frontend code.
2. **Validate inputs:** Validate API requests and data received from GitHub or the model.
3. **Isolate execution:** Run untrusted repository code in a restricted temporary environment. Docker alone is not a complete security boundary; use appropriate limits and restrictions.
4. **Limit permissions:** Request only the GitHub permissions needed for the features being used.
5. **Check ownership:** Ensure users can access only their own runs, reports, and connected account data.
6. **Require approval:** Do not publish a patch until the user approves the exact changes.
7. **Do not auto-merge:** Keep the final merge decision with repository maintainers.
8. **Report honestly:** Distinguish passed, failed, skipped, and not-run tests.

## Suggested project structure

The following is a suggested organization. The actual repository may differ.

```text
RepoPilot/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── workers/
│   │   └── app.ts
│   └── package.json
│
├── docs/
├── .gitignore
└── README.md
```

## Roadmap

The roadmap describes the intended development direction. Update the checkboxes as work is completed.

- [ ] GitHub OAuth authentication
- [ ] Public repository connection
- [ ] Repository metadata and file-tree retrieval
- [ ] Open issue listing and issue selection
- [ ] Gemma-powered issue analysis
- [ ] Relevant-file investigation
- [ ] Structured patch generation
- [ ] Patch validation and temporary workspace
- [ ] Isolated Docker test execution
- [ ] Live agent activity updates
- [ ] Patch Evidence Report
- [ ] Exact-patch approval flow
- [ ] Branch creation and commit
- [ ] Pull request creation
- [ ] Deployment and end-to-end testing

## Contributing

Contributions, feedback, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. Make your changes.
4. Run the relevant checks and tests.
5. Commit your changes:

   ```bash
   git add .
   git commit -m "feat: describe your change"
   ```

6. Push your branch:

   ```bash
   git push origin feature/your-feature-name
   ```

7. Open a pull request with a clear description of the change and how it was tested.

Please avoid committing secrets, credentials, generated build files, or unrelated changes.

## Team

**RepoPilot** is being developed as a collaborative hackathon project.

Add the contributors and their GitHub profiles here:

- **Project lead:** YOUR NAME — [GitHub profile](https://github.com/YOUR-USERNAME)
- **Team member:** TEAMMATE NAME — [GitHub profile](https://github.com/TEAMMATE-USERNAME)
- **Team member:** TEAMMATE NAME — [GitHub profile](https://github.com/TEAMMATE-USERNAME)

## License

Choose and add a license before distributing the project. Until a license file is added, do not assume that the repository is open for unrestricted reuse.

## Vision

We believe contributing to open source should be easier for everyone.

RepoPilot aims to turn an unfamiliar issue into a clear, tested, and reviewable contribution—while keeping developers in control at every important step.

**Understand the issue. Generate the patch. Verify the evidence. Let humans approve.**

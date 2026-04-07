# Tic-Tac-Toe · Real-time Multiplayer

A **server-authoritative** multiplayer Tic-Tac-Toe game built with [Nakama](https://heroiclabs.com/nakama/) (game server) and React (frontend).

---

## Live Deployments

| Resource | URL |
|---|---|
| **Game** | http://3.233.224.88 |
| **Nakama API** | http://3.233.224.88/v2/ |
| **Nakama Console** | http://3.233.224.88:7349 |

> Hosted on AWS EC2 (t3.micro, Amazon Linux 2023) behind nginx.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [Project Structure](#project-structure)
5. [Setup & Installation](#setup--installation)
6. [Deployment](#deployment)
7. [API & Server Configuration](#api--server-configuration)
8. [Testing Multiplayer](#testing-multiplayer)
9. [Design Decisions](#design-decisions)

---

## Architecture

```
Browser A ──┐                                  ┌── Browser B
            │  WebSocket  /ws → nakama:7350     │
            └────────► nginx (port 80) ◄────────┘
                              │
                              ▼
                       Nakama 3.22.0
                     (JS runtime module)
                              │
                        PostgreSQL 16
                   (leaderboard + accounts)
```

**Server-authoritative**: every action (move, ready, timeout) is validated exclusively on the server. Clients send intent; the server owns the truth.

**nginx as a reverse proxy**: the frontend and Nakama API/WebSocket all live on port 80, eliminating cross-origin and cross-port browser restrictions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Game server | Nakama 3.22.0 — TypeScript runtime module |
| Database | PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite |
| Realtime | Nakama WebSocket (nakama-js SDK v2.7) |
| Local dev | Docker Compose |
| Production | EC2 (t3.micro) + Docker Compose + nginx |
| IaC (optional) | AWS CloudFormation + ECS Fargate |

---

## Features

- **Private rooms** — create a room and share the ID with a friend
- **Quick match** — Nakama matchmaker pairs two players automatically
- **Timed mode** — 30 s turn timer; creator sets the mode; auto-forfeit on timeout
- **Live countdown** — urgent pulse animation when < 10 s remain
- **Global leaderboard** — W / L / D tracking, +200 pts per win, +50 pts per draw
- **Post-game leaderboard** — top-5 shown on the result screen
- **Rematch** — both players vote to replay, symbols swap for fairness
- **Disconnect win** — opponent leaving mid-game awards the remaining player a win
- **Device-id auth** — zero-friction, no emails; stable identity via `localStorage`

---

## Project Structure

```
tictactoe/
├── .env.example              ← secrets template – copy to .env and fill in values
├── .env                      ← local secrets (gitignored, never committed)
├── docker-compose.yml        ← local dev stack (reads vars from .env)
├── nakama/
│   ├── modules/
│   │   └── tictactoe.ts      ← ALL server-side game logic (TypeScript source)
│   ├── data/
│   │   └── modules/
│   │       └── tictactoe.js  ← compiled JS output (gitignored, built by npm run build)
│   ├── Dockerfile.nakama
│   ├── package.json          ← esbuild bundler
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/       ← Board, Timer, Leaderboard
│   │   ├── hooks/            ← useGame (match lifecycle), useCountdown
│   │   ├── lib/              ← Nakama client singleton + auth, op-codes
│   │   ├── pages/            ← Home, Game, LeaderboardPage
│   │   └── types/            ← shared TypeScript interfaces
│   ├── .env.example          ← frontend env template
│   ├── Dockerfile            ← production nginx image
│   ├── Dockerfile.dev        ← dev image (Vite HMR)
│   └── nginx.conf            ← SPA routing + /v2/ and /ws proxy to Nakama
└── deploy/
    └── aws/
        ├── cloudformation.yml  ← full AWS infrastructure (ECS Fargate + RDS)
        └── deploy-aws.sh       ← build & push helper
```

---

## Setup & Installation

### Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Node.js 20+

### Local Development

```bash
# 1. Clone
git clone https://github.com/manug18/tic-tac-with-nakama-backend.git
cd tic-tac-with-nakama-backend

# 2. Configure secrets
cp .env.example .env
# Open .env and set POSTGRES_PASSWORD, NAKAMA_SERVER_KEY, NAKAMA_CONSOLE_PASSWORD

# 3. Copy frontend env (already has correct localhost defaults)
cp frontend/.env.example frontend/.env.local

# 4. Build the Nakama TypeScript module
cd nakama && npm install && npm run build && cd ..

# 5. Start the full stack
docker compose up --build
```

| Service | URL |
|---|---|
| React app (Vite HMR) | http://localhost:5173 |
| Nakama API | http://localhost:7350/v2/ |
| Nakama Console | http://localhost:7349 |

> **Hot reload** works out of the box — the frontend container mounts `./frontend` as a volume.

> After changing `nakama/modules/tictactoe.ts` run `npm run build` inside `nakama/` then `docker compose restart nakama`.

### Environment Variables

**Root `.env`** (used by docker-compose):

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL password for the `nakama` user |
| `NAKAMA_SERVER_KEY` | Socket server key — must match `VITE_NAKAMA_SERVER_KEY` |
| `NAKAMA_CONSOLE_PASSWORD` | Nakama admin console password |

**`frontend/.env.local`** (used by Vite):

| Variable | Description |
|---|---|
| `VITE_NAKAMA_HOST` | Nakama host (e.g. `localhost` or EC2 IP) |
| `VITE_NAKAMA_PORT` | Nakama port (`7350` locally, `80` on EC2 via nginx proxy) |
| `VITE_NAKAMA_USE_SSL` | `true` for HTTPS deployments, `false` otherwise |
| `VITE_NAKAMA_SERVER_KEY` | Must match `NAKAMA_SERVER_KEY` |

---

## Deployment

### EC2 (current production setup)

```bash
# 1. SSH into your instance
ssh -i your-key.pem ec2-user@<EC2_IP>

# 2. Install dependencies (Amazon Linux 2023)
sudo yum install -y docker git nodejs npm
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user   # re-login after this

# Install Docker Compose plugin
mkdir -p ~/.docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose

# 3. Clone and configure
git clone https://github.com/manug18/tic-tac-with-nakama-backend.git
cd tic-tac-with-nakama-backend
cp .env.example .env
nano .env   # set strong passwords and server key

# 4. Build Nakama module
cd nakama && npm install && npm run build && cd ..

# 5. Create docker-compose.prod.yml (see below) and start
docker compose -f docker-compose.prod.yml up -d --build
```

**`docker-compose.prod.yml`** is identical to `docker-compose.yml` but uses the production `Dockerfile` (nginx) instead of `Dockerfile.dev`, and the frontend nginx proxies `/v2/` and `/ws` to Nakama so everything runs on port 80.

#### Updating production

```bash
cd ~/tic-tac-with-nakama-backend
git pull origin main
cd nakama && npm run build && cd ..
docker compose -f docker-compose.prod.yml up -d --build frontend
# Only restart nakama if server logic changed:
docker compose -f docker-compose.prod.yml restart nakama
```

### AWS ECS Fargate (optional)

```bash
# Set required environment variables first
export NAKAMA_SERVER_KEY="your-strong-key"
export AWS_REGION="us-east-1"

# Build Nakama module
cd nakama && npm ci && npm run build && cd ..

# Run the deploy script (builds images, pushes to ECR)
chmod +x deploy/aws/deploy-aws.sh
./deploy/aws/deploy-aws.sh

# Deploy full infrastructure via CloudFormation
aws cloudformation deploy \
  --stack-name tictactoe \
  --template-file deploy/aws/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    NakamaImage=<ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/tictactoe-nakama:latest \
    FrontendImage=<ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/tictactoe-frontend:latest \
    DBPassword=<STRONG_PASSWORD> \
    NakamaServerKey="$NAKAMA_SERVER_KEY"

# Get output URLs
aws cloudformation describe-stacks \
  --stack-name tictactoe \
  --query "Stacks[0].Outputs" --output table
```

---

## API & Server Configuration

### Nakama Server Configuration

| Setting | Value | Notes |
|---|---|---|
| `--socket.server_key` | from `NAKAMA_SERVER_KEY` env | Identifies this server to clients |
| `--runtime.js_entrypoint` | `tictactoe.js` | Compiled module in `nakama/data/modules/` |
| Tick rate | 5 Hz | Match loop runs 5× per second |
| Turn time | 30 s | Timed mode only; server auto-forfeits |

### Op-codes (WebSocket match data)

| Code | Direction | Payload | Description |
|---|---|---|---|
| `1` | Server → Client | `ServerState` JSON | Full game state snapshot (every tick) |
| `2` | Client → Server | `{ "index": 0–8 }` | Place a mark |
| `3` | Client → Server | `{}` | Signal ready to start |
| `4` | Bidirectional | _(empty)_ | Keep-alive ping |
| `5` | Client → Server | `{}` | Vote for rematch |

### RPC Endpoints

| RPC | Payload | Response |
|---|---|---|
| `POST /v2/rpc/create_match` | `{ "timed": true\|false }` | `{ "matchId": "..." }` |
| `POST /v2/rpc/get_leaderboard` | `{}` | `{ "records": [...] }` |

### ServerState Schema

```jsonc
{
  "board":        [null, "X", null, "O", null, null, null, null, null],
  "currentTurn":  "<sessionId>",       // whose turn it is
  "phase":        "lobby|playing|finished",
  "winner":       "<sessionId>|draw|null",
  "timedMode":    true,                // set at room creation, immutable
  "turnStart":    1712300000000,       // epoch ms – when current turn started
  "turnTimeSec":  30,
  "symbols":      { "<sessionId>": "X", "<sessionId2>": "O" },
  "rematchVotes": ["<sessionId>"]      // who has voted for rematch
}
```

### Leaderboards

Four Nakama leaderboards are maintained per game result:

| ID | Operator | Tracks |
|---|---|---|
| `global_points` | `BEST` | Total score (200 per win, 50 per draw) |
| `global_wins` | `INCR` | Win count |
| `global_losses` | `INCR` | Loss count |
| `global_draws` | `INCR` | Draw count |

---

## Testing Multiplayer

### Option A — Two browser windows (same machine)

1. `docker compose up` (ensure module is built first)
2. Open `http://localhost:5173` in **Window 1** → enter a username → **Create Private Room** → optionally enable Timed Mode → copy the Room ID shown
3. Open `http://localhost:5173` in a **second window** (incognito) → enter a different username → paste Room ID → **Join Room**
4. Both players appear in the lobby → click **Ready!** in both windows
5. Play the game — moves, timer (if timed mode), and results update in real time

### Option B — Quick Match

1. Open two browser windows (different sessions)
2. Click **Quick Match** in both within ~10 seconds of each other
3. Nakama's matchmaker pairs them automatically; both windows navigate to the same game

### Option C — Two physical devices

1. Both devices must reach the same Nakama instance
2. For local testing: connect both to the same Wi-Fi, set `VITE_NAKAMA_HOST` to your machine's LAN IP
3. For production: use the live URL http://3.233.224.88

### Option D — Nakama Console (inspect state)

1. Open http://localhost:7349 (local) or http://3.233.224.88:7349 (production)
2. Login with `admin` + the password from your `.env`
3. Go to **Matches** → click a live match to inspect board, presences, and match labels in real time

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **TypeScript → esbuild → single JS file** | Strong types during development; fast single-file output Nakama can load; no Lua learning curve |
| **Full state broadcast every tick** | Simple and reliable; clients are always in sync even after reconnect; no delta-patching complexity |
| **Server sets `timedMode` at creation** | Mode is locked by the room creator — avoids a consensus race where the joiner (who has no URL param) votes the wrong mode |
| **nginx reverse proxy on port 80** | Eliminates cross-origin and cross-port browser restrictions (Safari blocks requests from port 80 to 7350); single origin for both SPA and Nakama API |
| **Equality check in `useGame`** | Skips re-renders when only `turnStart` changes (server updates it every tick in timed mode); countdown runs on its own `setInterval` in `useCountdown` |
| **`INCREMENTAL` leaderboard operator** | Atomically increments wins/losses/draws without a read-modify-write; safe under concurrent match finishes |
| **Device-id auth** | Zero friction — no signup required; `localStorage` gives stable identity across page refreshes |
| **Rematch symbol swap** | X always has first-move advantage; swapping symbols each rematch makes the series fair |
| **`null` return from `matchLoop`** | Terminates and garbage-collects the match server-side when neither player needs it anymore |

---

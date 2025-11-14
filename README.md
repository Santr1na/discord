# Discord Mini (prototype)

This is a minimal prototype of a Discord-like app with registration, friends, messaging and WebRTC-based voice calling (signaling only). It's intended as a starting point, not a production-ready app.

Quick start

1. Install dependencies

```bash
cd /home/santrina/discord
npm install
```

2. Start the server

```bash
npm run dev
```

3. Open `http://localhost:3000` in your browser (use two browser windows/tabs to test calls/messages between users).

React client (development)

Open another terminal and start the React client (optional — the server also serves a simple static page but the React client provides a nicer UI):

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` for the React UI. Vite proxies `/api` and socket.io to the server.

Notes

- The project uses `better-sqlite3` and a local `data.sqlite` file will be created.
- For production, it's recommended to use PostgreSQL. This repo now supports Postgres when `DATABASE_URL` is set.
- Use a managed Postgres (Render, Railway, DigitalOcean Managed DB, etc.) and set `DATABASE_URL` in your service environment.
- The repository includes a `Dockerfile` for containerized deployments.
- WebRTC is peer-to-peer; this project only implements signaling via Socket.IO.
- Security: JWT secret is a simple env var. For production, provide a strong secret and HTTPS.
- Production checklist:
- 1) Deploy backend to a provider that supports WebSockets (Render, Fly.io, Railway, DigitalOcean, VPS).
- 2) Provide `DATABASE_URL` (Postgres) and `JWT_SECRET` in environment variables.
- 3) Set `VITE_API_BASE` in Vercel to the backend URL and redeploy frontend.
- 4) Use the `/healthz` endpoint to verify the server is up.
Render (step-by-step example)

1) Create a managed Postgres on Render (optional) or use Render's Database service. Copy the `DATABASE_URL`.

2) Create a new Web Service on Render:
	 - Connect your GitHub repository and pick the branch.
	 - Build Command: `npm install`
	 - Start Command: `npm start`
	 - Add Environment Variables:
		 - `DATABASE_URL` = your Postgres connection string
		 - `JWT_SECRET` = a strong secret
	 - Deploy the service.

3) After deployment you'll get a URL like `https://my-discord-backend.onrender.com`.

4) In Vercel project settings, set `VITE_API_BASE = https://my-discord-backend.onrender.com` and redeploy the frontend.

Docker + Fly.io (alternative)

1) Build Docker image locally for testing:

```bash
docker build -t discord-backend:latest .
docker run -e DATABASE_URL="postgres://..." -e JWT_SECRET="secret" -p 3000:3000 discord-backend:latest
```

2) To deploy with Fly:

```bash
flyctl launch --name my-discord-backend
flyctl deploy
flyctl secrets set DATABASE_URL="postgres://..." JWT_SECRET="secret"
```

Migration notes (SQLite -> Postgres)

- If you have existing SQLite data you want to migrate, export using `sqlite3` and import into Postgres, or write a small migration script that reads from SQLite and inserts into Postgres using node script. For most demos it's acceptable to start with a fresh Postgres DB.

- This is a simplified demo: no input validation, limited error handling, and minimal UI.

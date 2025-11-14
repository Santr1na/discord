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
- WebRTC is peer-to-peer; this project only implements signaling via Socket.IO.
- Security: JWT secret is a simple env var. For production, provide a strong secret and HTTPS.
- This is a simplified demo: no input validation, limited error handling, and minimal UI.

# Shōgun — Online Multiplayer Server

An authoritative WebSocket server for **Shōgun: Rise of the Clans**. It reuses
the browser game engine (`../js/*.js`) via `loader.js`, so the rules are never
re-implemented: the server holds the true game state and pushes each player a
**fog-of-war-redacted view**. Supports **public** rooms (anyone can join) and
**private** rooms (the host approves each joiner).

## Run it locally

```bash
cd server
npm install
PORT=8787 npm start
```

Then point the game client at it: edit `js/netconfig.js` in the project root:

```js
window.SHOGUN_SERVER = "ws://localhost:8787";
```

Open `index.html` (served over http, e.g. `python3 -m http.server`) in two
browser tabs → **Play Online** → Host in one, Join by code in the other.

## Deploy it for real (free tiers)

The client is static (host it on GitHub Pages / Netlify). The server is a small
Node process — deploy **the `server/` folder** to any host that runs Node:

**Render.com** (example)
1. New → **Web Service** → connect this repo.
2. **Root Directory:** `server`  ·  **Build:** `npm install`  ·  **Start:** `npm start`.
3. Render sets `PORT` for you. Deploy; copy the URL (e.g. `https://shogun-xyz.onrender.com`).
4. In `js/netconfig.js` set `window.SHOGUN_SERVER = "wss://shogun-xyz.onrender.com";`
   (use **wss://** — secure — because your site is served over https).
5. Commit & redeploy the client. Done.

Railway and Fly.io work the same way (root dir `server`, start `npm start`,
they provide `PORT`). Free tiers may sleep when idle; the first connection
after a nap can take a few seconds to wake.

## Protocol (for reference)

JSON messages over WebSocket, each with a `t` field.

| Client → server | Purpose |
|---|---|
| `host {name,visibility,mode,len,clan}` | create a room |
| `join {code,name,clan?}` | join (public: seated; private: pending) |
| `approve {clientId,ok}` | host admits/denies a private joiner |
| `pickClan {clan}` · `ready` · `start` | lobby |
| `action {kind,payload}` · `endTurn` | play (only on your turn) |
| `listPublic` | browse public rooms |

| Server → client | Purpose |
|---|---|
| `room` | lobby state (seats, pending) |
| `joinRequest` | a private-room join is awaiting the host |
| `view` | your redacted game state |
| `report` | a battle/op result |
| `publicRooms` · `error` | listings / errors |

## Notes
- Empty seats are filled by the game's built-in AI, so a game can start with
  as few as one human.
- A player who drops mid-game hands their clan to the AI; the game continues.
- v1 auto-resolves battle sub-choices (defender stance, seppuku) server-side;
  fully interactive cross-network battles are a future enhancement.

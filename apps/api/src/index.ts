import { Hono } from "hono";

const app = new Hono();

// Health check
app.get("/api/health", (c) => c.json({ status: "ok", service: "api" }));

// Placeholder inventory endpoint — replace with real data access.
app.get("/api/items", (c) => c.json({ items: [] }));

const port = Number(process.env.PORT ?? 3001);

console.log(`[api] Hono server listening on http://localhost:${port}`);

// Bun reads this default export and starts the server.
export default {
  port,
  fetch: app.fetch,
};

import { readFileSync } from "fs";
import index from "./index.html";

const isDev = Bun.env.NODE_ENV !== "production";

const LICHESS_HOST = Bun.env.LICHESS_HOST ?? "https://lichess.org";

function loadUpstreamToken(): string {
  if (Bun.env.LICHESS_API_TOKEN) return Bun.env.LICHESS_API_TOKEN;

  const secretFile = Bun.env.LICHESS_API_TOKEN_FILE;
  if (secretFile) return readFileSync(secretFile, "utf-8").trim();

  console.error("Error: LICHESS_API_TOKEN or LICHESS_API_TOKEN_FILE is required.");
  console.error("Create a .env file with LICHESS_API_TOKEN=lip_... or export it in your shell.");
  process.exit(1);
}

const LICHESS_API_TOKEN = loadUpstreamToken();

function proxyRoute(path: string) {
  return async (req: Request) => {
    const url = new URL(req.url);
    const upstream = new URL(path, LICHESS_HOST);
    upstream.search = url.search;

    const res = await fetch(upstream, {
      headers: {
        Authorization: `Bearer ${LICHESS_API_TOKEN}`,
      },
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    });
  };
}

const server = Bun.serve({
  port: Number(Bun.env.PORT) || 3000,
  routes: {
    "/": index,

    "/api/event/calendar": proxyRoute("/api/event/calendar"),
    "/api/tournament/manager/calendar": proxyRoute("/api/tournament/manager/calendar"),
    "/api/broadcast/spotlight-rounds": proxyRoute("/api/broadcast/spotlight-rounds"),
  },

  development: isDev ? { hmr: true, console: true } : false,
});

console.log(`Listening on ${server.url}`);

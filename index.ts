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

const HEALTHCHECK_KEY = Bun.env.HEALTHCHECK_KEY;

function proxyRoute(path: string) {
  return async (req: Request) => {
    const url = new URL(req.url);
    const upstream = new URL(path, LICHESS_HOST);
    upstream.search = url.search;

    let res: Response;
    try {
      res = await fetch(upstream, {
        headers: {
          Authorization: `Bearer ${LICHESS_API_TOKEN}`,
        },
      });
    } catch (err) {
      console.log(`Error proxying ${path}: ${(err as Error).message}`);
      return Response.json({ error: `failed to reach lichess: ${(err as Error).message}` }, { status: 502 });
    }

    if (!res.ok) {
      console.log(`Error proxying ${path}: lichess responded with status ${res.status}`);
    }

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    });
  };
}

type TokenTestResult = {
  userId: string;
  scopes: string;
  expires: number | null;
} | null;

async function healthcheck(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!HEALTHCHECK_KEY || key !== HEALTHCHECK_KEY) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const upstream = new URL("/api/token/test", LICHESS_HOST);

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: LICHESS_API_TOKEN,
    });
  } catch (err) {
    console.log(`Error checking lichess token: ${(err as Error).message}`);
    return Response.json(
      { ok: false, error: `failed to reach lichess: ${(err as Error).message}` },
      { status: 503 },
    );
  }

  if (!res.ok) {
    console.log(`Error checking lichess token: lichess responded with status ${res.status}`);
    return Response.json(
      { ok: false, error: `lichess responded with status ${res.status}` },
      { status: 503 },
    );
  }

  const body = (await res.json()) as Record<string, TokenTestResult>;
  const result = body[LICHESS_API_TOKEN];

  if (!result || (result.expires !== null && result.expires < Date.now())) {
    return Response.json({ ok: false, error: "lichess API token is invalid or expired" }, { status: 503 });
  }

  return Response.json({ ok: true, userId: result.userId, scopes: result.scopes, expires: result.expires });
}

const server = Bun.serve({
  port: Number(Bun.env.PORT) || 3000,
  routes: {
    "/": index,

    "/api/healthcheck": healthcheck,

    "/api/event/calendar": proxyRoute("/api/event/calendar"),
    "/api/tournament/manager/calendar": proxyRoute("/api/tournament/manager/calendar"),
    "/api/broadcast/spotlight-rounds": proxyRoute("/api/broadcast/spotlight-rounds"),
  },

  development: isDev ? { hmr: true, console: true } : false,
});

console.log(`Listening on ${server.url}`);

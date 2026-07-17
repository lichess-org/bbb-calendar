import index from "./index.html";

const UPSTREAM_ORIGIN = "http://localhost:9663";
const UPSTREAM_TOKEN = "lip_admin";

function proxyRoute(path: string) {
  return async (req: Request) => {
    const url = new URL(req.url);
    const upstream = new URL(path, UPSTREAM_ORIGIN);
    upstream.search = url.search;

    const res = await fetch(upstream, {
      headers: {
        Authorization: `Bearer ${UPSTREAM_TOKEN}`,
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
  routes: {
    "/": index,

    "/api/event/calendar": proxyRoute("/api/event/calendar"),
    "/api/tournament/manager/calendar": proxyRoute("/api/tournament/manager/calendar"),
    "/api/broadcast/spotlight-rounds": proxyRoute("/api/broadcast/spotlight-rounds"),
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Listening on ${server.url}`);

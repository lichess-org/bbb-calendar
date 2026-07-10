import index from "./index.html";

const UPSTREAM_BASE = "http://localhost:9663/api/event/calendar";
const UPSTREAM_TOKEN = "lip_admin";

const server = Bun.serve({
  routes: {
    "/": index,

    "/api/event/calendar": async (req) => {
      const url = new URL(req.url);
      const upstream = new URL(UPSTREAM_BASE);
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
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Listening on ${server.url}`);

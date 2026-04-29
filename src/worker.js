const BLOCKED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
]);

function buildHeaders(reqHeaders) {
  const out = new Headers();
  let clientIp = null;

  for (const [k, v] of reqHeaders) {
    const lower = k.toLowerCase();
    if (BLOCKED_HEADERS.has(lower)) continue;
    if (lower.startsWith("cf-")) continue;
    if (lower === "x-real-ip") { clientIp = v; continue; }
    if (lower === "x-forwarded-for") { if (!clientIp) clientIp = v; continue; }
    out.set(k, v);
  }

  if (clientIp) out.set("x-forwarded-for", clientIp);
  return out;
}

export default {
  async fetch(request, env) {
    const TARGET_BASE = (env.TARGET_DOMAIN || "").replace(/\/+$/, "");

    if (!TARGET_BASE) {
      return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
    }

    try {
      const url = new URL(request.url);
      const targetUrl = TARGET_BASE + url.pathname + url.search;

      const headers = buildHeaders(request.headers);
      const method = request.method;
      const hasBody = method !== "GET" && method !== "HEAD";

      const fetchOpts = {
        method,
        headers,
        redirect: "manual",
      };

      if (hasBody) {
        fetchOpts.body = request.body;
      }

      const upstream = await fetch(targetUrl, fetchOpts);

      const respHeaders = new Headers();
      for (const [k, v] of upstream.headers) {
        if (k.toLowerCase() === "transfer-encoding") continue;
        respHeaders.set(k, v);
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: respHeaders,
      });

    } catch (err) {
      return new Response("Bad Gateway: upstream unreachable", { status: 502 });
    }
  }
};

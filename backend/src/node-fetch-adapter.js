import { Readable } from "node:stream";

export function toWebRequest(req) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  return new Request(url.toString(), {
    method: req.method,
    headers,
    ...(hasBody ? { body: Readable.toWeb(req), duplex: "half" } : {})
  });
}

export async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

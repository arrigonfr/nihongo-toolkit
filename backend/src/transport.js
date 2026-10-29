import { gzipSync } from "node:zlib";

export function sendBody(req, res, body, type, compression) {
  res.setHeader("Content-Type", type);
  const bytes = Buffer.from(body);
  const acceptsGzip = (req.headers["accept-encoding"] ?? "").split(",").some((part) => {
    const [encoding, ...parameters] = part.trim().toLowerCase().split(";");
    const quality = parameters.find((p) => p.trim().startsWith("q="));
    return encoding === "gzip" && (!quality || Number(quality.trim().slice(2)) > 0);
  });
  if (compression && acceptsGzip && bytes.length >= 1024) {
    const compressed = gzipSync(bytes);
    if (compressed.length < bytes.length) {
      res.setHeader("Content-Encoding", "gzip");
      res.end(compressed);
      return;
    }
  }
  res.end(bytes);
}

// @ts-check
import { selectedLevels } from "@nihon/shared/jlpt-levels";

export const CACHE_STATIC = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600";
export const CACHE_DYNAMIC = "public, max-age=300, s-maxage=3600, stale-while-revalidate=300";
export const JAPANESE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** @param {string} value */
export function ftsTrigramQuery(value) {
  const trimmed = value.trim();
  if ([...trimmed].length < 3) return null;
  return `"${trimmed.replace(/"/g, '""')}"`;
}

/** @param {string} value */
export function ftsShortTermQuery(value) {
  const trimmed = value.trim();
  const length = [...trimmed].length;
  if (length < 1 || length >= 3 || !/^[\p{L}\p{N}]+$/u.test(trimmed)) return null;
  const escaped = trimmed.replace(/"/g, '""');
  return { exact: `"${escaped}"`, prefix: `"${escaped}"*` };
}

/** @param {string} prefix */
export function prefixUpperBound(prefix) {
  const chars = [...prefix];
  const last = chars.pop();
  if (!last) return prefix;
  return `${chars.join("")}${String.fromCodePoint((last.codePointAt(0) ?? 0) + 1)}`;
}

/**
 * @param {string | null} value
 * @param {number | null} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function integer(value, fallback, min, max) {
  if (value === null) return /** @type {number} */ (fallback);
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new HttpError(400, `Expected an integer from ${min} to ${max}`);
  }
  return Number(value);
}

/**
 * @param {URLSearchParams} params
 * @param {string} [prefix]
 * @returns {{ sql: string, args: number[] }}
 */
export function levelFilter(params, prefix = "") {
  const col = prefix ? `${prefix}.jlpt` : "jlpt";
  const value = params.get("level");
  if (value === null || value === "all") return { sql: "", args: [] };
  if (value === "none") return { sql: " AND 0", args: [] };
  if (value.includes(",")) {
    /** @type {Array<number | string>} */
    let levels;
    try {
      levels = selectedLevels(value);
    } catch {
      throw new HttpError(400, "Choose valid JLPT levels.");
    }
    const numbers = /** @type {number[]} */ (levels.filter((n) => typeof n === "number"));
    return {
      sql: ` AND (${numbers.length ? `${col} IN (${numbers.map(() => "?").join(",")})` : "0"}${levels.includes("unrated") ? ` OR ${col} IS NULL` : ""})`,
      args: numbers,
    };
  }
  if (value === "unrated") return { sql: ` AND ${col} IS NULL`, args: [] };
  const rangeMatch = value.match(/^N?([1-5])[-–]N?([1-5])$/i);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    return { sql: ` AND ${col} BETWEEN ? AND ?`, args: [Math.min(a, b), Math.max(a, b)] };
  }
  const level = integer(value.replace(/^N/i, ""), null, 1, 5);
  return { sql: ` AND ${col} = ?`, args: [level] };
}

/** @param {string} value */
export function characterValue(value) {
  if ([...value].length !== 1) throw new HttpError(400, "Expected one kanji character");
  return value;
}

/** @param {URLSearchParams} params */
export function searchTerm(params) {
  const value = (params.get("keyword") ?? params.get("q") ?? "").trim();
  if (!value || value.length > 100) throw new HttpError(400, "Search must contain 1-100 characters");
  return value;
}

/**
 * @param {{ method?: string, headers: Record<string, string | string[] | undefined> }} req
 * @param {{ statusCode: number, setHeader(name: string, value: string): void, end(): void }} res
 * @param {string[]} allowedOrigins
 */
export function applyStandardHeaders(req, res, allowedOrigins) {
  const rawOrigin = req.headers.origin;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, "Origin is not allowed");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Expose-Headers", "Server-Timing");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    throw new HttpError(405, "Method not allowed");
  }
  return false;
}

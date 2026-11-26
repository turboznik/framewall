/**
 * Guard for the board API (`/__framewall/*`). Vite checks the Host header and
 * answers CORS preflights for localhost origins, but a page on another site can
 * still send a "simple" cross-site POST, and a page on another local port gets
 * through CORS. So writes must be JSON (no simple request can carry that type)
 * from the server's own origin, or from a configured host.
 *
 * The guard repeats Vite's `server.allowedHosts` check (which stops DNS
 * rebinding), because Vite skips it when `server.https` is set.
 */

import { isIP } from "node:net"
import type { IncomingMessage, ServerResponse } from "node:http"

import { send } from "./selection.ts"

export const API_PREFIX = "/__framewall/"

export type AllowedHosts = readonly string[] | true

/** `name` matches a configured host: exactly, or as a subdomain of a `.example.com` entry. */
const listed = (allowed: readonly string[], name: string) =>
  allowed.some((h) => h === name || (h.startsWith(".") && (h.slice(1) === name || name.endsWith(h))))

/** Vite's rule: IP addresses, localhost and the configured names. */
export function hostAllowed(host: string | undefined, allowed: AllowedHosts): boolean {
  if (allowed === true) return true
  if (!host) return false
  let name: string
  try {
    name = new URL(`http://${host}`).hostname
  } catch {
    return false
  }
  if (name.startsWith("[") || isIP(name)) return true
  if (name === "localhost" || name.endsWith(".localhost")) return true
  return listed(allowed, name)
}

function originAllowed(origin: string, host: string | undefined, allowed: AllowedHosts): boolean {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false // "null" (sandboxed iframes, file://)
  }
  // Behind a reverse proxy the Host may be the upstream address: accept the configured names too.
  return url.host === host || (allowed !== true && listed(allowed, url.hostname))
}

/** Why a board API request is refused, or null when it may go ahead. */
export function apiRejection(req: IncomingMessage, allowed: AllowedHosts): { status: number; error: string } | null {
  const host = req.headers.host
  if (!hostAllowed(host, allowed)) return { status: 403, error: "host not allowed" }
  if (req.method === "GET" || req.method === "HEAD") return null
  const origin = req.headers.origin
  if (origin !== undefined && !originAllowed(origin, host, allowed)) return { status: 403, error: "cross-origin write" }
  const type = (req.headers["content-type"] ?? "").toLowerCase()
  if (!type.startsWith("application/json")) return { status: 415, error: "expected application/json" }
  return null
}

/** Connect middleware in front of the API endpoints. */
export function apiGuard(allowedHosts: () => AllowedHosts) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!(req.url ?? "").startsWith(API_PREFIX)) return next()
    const rejection = apiRejection(req, allowedHosts())
    if (rejection) return send(res, rejection.status, JSON.stringify({ error: rejection.error }))
    next()
  }
}

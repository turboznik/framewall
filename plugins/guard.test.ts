import type { IncomingMessage } from "node:http"
import { describe, expect, it } from "vitest"

import { apiRejection, hostAllowed } from "./guard.ts"

const req = (method: string, headers: Record<string, string>) => ({ method, headers }) as unknown as IncomingMessage

const json = { host: "127.0.0.1:5173", "content-type": "application/json" }

describe("hostAllowed", () => {
  it("allows IP addresses and localhost", () => {
    for (const host of ["127.0.0.1:5173", "[::1]:5173", "192.168.1.20", "localhost:5173", "app.localhost"]) {
      expect(hostAllowed(host, [])).toBe(true)
    }
  })

  it("refuses other names unless configured", () => {
    expect(hostAllowed("evil.test:5173", [])).toBe(false)
    expect(hostAllowed(undefined, [])).toBe(false)
    expect(hostAllowed("box.example.com", ["box.example.com"])).toBe(true)
    expect(hostAllowed("a.example.com:8443", [".example.com"])).toBe(true)
    expect(hostAllowed("example.com", [".example.com"])).toBe(true)
    expect(hostAllowed("notexample.com", [".example.com"])).toBe(false)
    expect(hostAllowed("anything.test", true)).toBe(true)
  })
})

describe("apiRejection", () => {
  it("lets reads through from an allowed host", () => {
    expect(apiRejection(req("GET", { host: "localhost:5173" }), [])).toBeNull()
    expect(apiRejection(req("GET", { host: "evil.test:5173" }), [])?.status).toBe(403)
  })

  it("accepts JSON writes from the same origin or without one (CLI, curl)", () => {
    expect(apiRejection(req("PUT", json), [])).toBeNull()
    expect(apiRejection(req("PUT", { ...json, origin: "http://127.0.0.1:5173" }), [])).toBeNull()
    expect(apiRejection(req("POST", { ...json, "content-type": "application/json; charset=utf-8" }), [])).toBeNull()
  })

  it("refuses writes that a page on another site could send", () => {
    expect(apiRejection(req("POST", { ...json, "content-type": "text/plain" }), [])?.status).toBe(415)
    expect(apiRejection(req("POST", { host: json.host }), [])?.status).toBe(415)
    expect(apiRejection(req("PUT", { ...json, origin: "http://evil.test" }), [])?.status).toBe(403)
    expect(apiRejection(req("PUT", { ...json, origin: "http://localhost:3000" }), [])?.status).toBe(403)
    expect(apiRejection(req("PUT", { ...json, origin: "null" }), [])?.status).toBe(403)
  })

  it("accepts writes from a configured host behind a proxy", () => {
    const proxied = { ...json, origin: "https://box.example.com:8443" }
    expect(apiRejection(req("PUT", proxied), ["box.example.com"])).toBeNull()
    expect(apiRejection(req("PUT", proxied), true)?.status).toBe(403)
  })
})

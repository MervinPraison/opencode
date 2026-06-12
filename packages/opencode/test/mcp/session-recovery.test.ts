import { describe, expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"

describe("mcp session recovery", () => {
  test("reinitializes and retries once after a session-bound POST returns 404", async () => {
    const posts: Array<{ method: string; session: string | null }> = []
    let initializeCount = 0
    let pingCount = 0
    const transport = new StreamableHTTPClientTransport(new URL("https://example.test/mcp"), {
      fetch: async (_input, init) => {
        if (init?.method === "GET") return new Response(null, { status: 405 })
        if (init?.method === "DELETE") return new Response(null, { status: 200 })

        const message = JSON.parse(String(init?.body)) as { id?: number; method: string }
        const session = new Headers(init?.headers).get("mcp-session-id")
        posts.push({ method: message.method, session })

        if (message.method === "initialize") {
          initializeCount++
          return Response.json(
            {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                protocolVersion: LATEST_PROTOCOL_VERSION,
                capabilities: {},
                serverInfo: { name: "test", version: "1" },
              },
            },
            { headers: { "mcp-session-id": initializeCount === 1 ? "expired" : "replacement" } },
          )
        }

        if (message.method === "notifications/initialized") return new Response(null, { status: 202 })

        pingCount++
        if (pingCount === 1) return new Response("Session not found", { status: 404 })
        return Response.json({ jsonrpc: "2.0", id: message.id, result: {} })
      },
    })
    const client = new Client({ name: "test", version: "1" })

    try {
      await client.connect(transport)
      await expect(client.ping()).resolves.toEqual({})

      expect(posts).toEqual([
        { method: "initialize", session: null },
        { method: "notifications/initialized", session: "expired" },
        { method: "ping", session: "expired" },
        { method: "initialize", session: null },
        { method: "notifications/initialized", session: "replacement" },
        { method: "ping", session: "replacement" },
      ])
    } finally {
      await client.close()
    }
  })
})

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Dev only: serve api/*.ts like Vercel does, so `pnpm dev` works without the Vercel CLI. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/room', async (req, res) => {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const { POST } = await server.ssrLoadModule('/api/room.ts')
        const response: Response = await POST(
          new Request('http://localhost/api/room', {
            method: req.method,
            headers: { 'content-type': 'application/json', 'content-length': String(Buffer.concat(chunks).length) },
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          }),
        )
        res.statusCode = response.status
        res.setHeader('content-type', 'application/json')
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Expose server-side vars (SUPABASE_SECRET_KEY...) to the dev API only; Vite still ships only VITE_* to the browser.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), devApi()],
    server: { host: true },
  }
})

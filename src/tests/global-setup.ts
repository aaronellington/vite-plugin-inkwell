import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import sirv from "sirv"
import { build } from "vite"

export const DIR_ROOT = path.resolve(import.meta.dirname, "../example")
export const DIR_ASSETS = "assets"
export const DIR_OUT = "../../.config/tmp/dist"
export const DIR_CONTENT = path.join(DIR_ROOT, "content") // Note: this needs to match the import in: example/src/main.ts

export default async function globalSetup() {
	// Clean up any stale HMR test files from previous runs
	for (const file of fs.readdirSync(DIR_CONTENT)) {
		if (file.startsWith("hmr-") && file.endsWith(".md")) {
			fs.rmSync(path.join(DIR_CONTENT, file), { force: true })
		}
	}

	await build({
		root: DIR_ROOT,
		build: {
			emptyOutDir: true,
			outDir: DIR_OUT,
			assetsDir: DIR_ASSETS,
			assetsInlineLimit: 0,
		},

		logLevel: "warn",
	})

	const serve = sirv(path.join(DIR_ROOT, DIR_OUT))
	const server = http.createServer(serve)

	await new Promise<void>((resolve) => {
		server.listen(0, resolve)
	})

	const addr = server.address()
	const port = typeof addr === "object" && addr ? addr.port : 0

	// This is so it can be used in the playwright.use.baseURL
	process.env.PREVIEW_PORT = String(port)

	return async () => {
		server.close()
	}
}

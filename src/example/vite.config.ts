import { inkwell } from "@aaronellington/vite-plugin-inkwell"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, import.meta.dirname)

	return {
		plugins: [
			inkwell({
				collections: {
					blog: {
						contentPath: "./content",
						basePath: "/blog/",
						feed: {
							outputPath: "rss.xml",
							siteTitle: "Inkwell Example",
							siteUrl: env.VITE_SITE_URL,
							siteDescription: "An example RSS feed from Inkwell",
							language: "en",
						},
					},
				},
			}),
		],
	}
})

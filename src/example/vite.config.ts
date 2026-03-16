import { defineConfig, loadEnv } from "vite"
import { inkwell } from "../index"

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
							siteDescription: "An example Atom feed from Inkwell",
							language: "en",
							copyright: "Copyright © 2025, Inkwell Team",
						},
					},
				},
			}),
		],
	}
})

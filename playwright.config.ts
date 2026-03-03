import { defineConfig } from "@playwright/test"

export default defineConfig({
	testDir: "./src/tests",
	globalSetup: "./src/tests/global-setup.ts",
	outputDir: "./.config/tmp/tests/test-results",
	use: {
		baseURL: `http://localhost:${process.env.PREVIEW_PORT}`,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
})

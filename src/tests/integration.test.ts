import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { createServer } from "vite"
import { DIR_ASSETS, DIR_CONTENT, DIR_ROOT } from "./global-setup"

test.describe("production build", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/")
	})

	test("renders the post list with correct titles", async ({ page }) => {
		const items = page.locator("nav ul li")

		await expect(items).toHaveCount(2)

		await expect(items.nth(0).locator("a")).toContainText("Hello World")
		await expect(items.nth(0)).toHaveAttribute("data-slug", "hello-world") // From filename

		await expect(items.nth(1)).toHaveAttribute(
			"data-slug",
			"using-inkwell-slug",
		) // From slug frontmatter
		await expect(items.nth(1).locator("a")).toContainText("Using Inkwell")
	})

	test("excludes draft posts from production build", async ({ page }) => {
		const drafts = page.locator('nav ul li[data-slug="draft-post"]')
		await expect(drafts).toHaveCount(0)
	})

	test("clicking a post loads its HTML into #detail", async ({ page }) => {
		const detail = page.locator("#detail")
		await expect(detail).toBeEmpty()

		await page.locator("nav ul li").nth(0).locator("a").click()
		await expect(detail.locator("h1")).toHaveText("Hello World")
		await expect(detail).toContainText(
			"This is the first post demonstrating Inkwell.",
		)
	})

	test("asset images resolve to valid URLs", async ({ page }) => {
		await page.locator("nav ul li").nth(0).locator("a").click()

		const img = page.locator("#detail img")
		await expect(img).toHaveCount(1)
		await expect(img).toHaveAttribute("alt", "Sample graphic")

		const src = await img.getAttribute("src")
		expect(src).toBeTruthy()
		expect((src as string).startsWith(`/${DIR_ASSETS}/`)).toBe(true)

		// Verify the hashed URL loads
		expect(src).toMatch(/-[a-zA-Z0-9]{8}\.\w+$/) // e.g. sample-Cr3NeDLH.svg
		const response = await page.request.get(src as string)
		expect(response.ok()).toBe(true)
	})

	test("links with file extensions get target=_blank", async ({ page }) => {
		await page.locator("nav ul li").nth(0).locator("a").click()

		const assetLink = page.locator('#detail a[target="_blank"]')
		await expect(assetLink).toHaveCount(1)
		await expect(assetLink).toHaveAttribute("rel", "noopener noreferrer")
	})

	test("absolute and protocol URLs are not treated as assets", async ({
		page,
	}) => {
		await page.locator("nav ul li").nth(0).locator("a").click()

		const detail = page.locator("#detail")

		// /favicon.ico image should keep its original src unchanged
		const favicon = detail.locator('img[alt="Favicon"]')
		await expect(favicon).toHaveCount(1)
		await expect(favicon).toHaveAttribute("src", "/favicon.ico")

		// https:// link should not get target=_blank from the asset extension
		const externalLink = detail.locator('a[href="https://example.com/page.html"]')
		await expect(externalLink).toHaveCount(1)
		await expect(externalLink).not.toHaveAttribute("target", "_blank")

		// mailto: link should not get target=_blank from the asset extension
		const mailtoLink = detail.locator('a[href="mailto:hello@example.com"]')
		await expect(mailtoLink).toHaveCount(1)
		await expect(mailtoLink).not.toHaveAttribute("target", "_blank")
	})
})

test.describe("dev mode", () => {
	let devServer: Awaited<ReturnType<typeof createServer>>
	let devURL: string

	test.beforeAll(async () => {
		devServer = await createServer({
			root: DIR_ROOT,
			server: { port: 0 },
			logLevel: "warn",
		})
		await devServer.listen()
		const addr = devServer.httpServer?.address()
		const port = typeof addr === "object" && addr ? addr.port : 0
		devURL = `http://localhost:${port}`
	})

	test.afterAll(async () => {
		await devServer.close()
	})

	test("includes draft posts in dev mode", async ({ page }) => {
		await page.goto(devURL)

		const items = page.locator("nav ul li")
		await expect(items).toHaveCount(3)

		const draftItem = page.locator('nav ul li[data-draft="true"]')
		await expect(draftItem).toHaveCount(1)
		await expect(draftItem).toHaveAttribute("data-slug", "draft-post")
	})

	test("new markdown file appears via HMR without manual reload", async ({
		page,
	}) => {
		await page.goto(devURL)
		const items = page.locator("nav ul li")
		await expect(items).toHaveCount(3)

		const slug = `hmr-${crypto.randomUUID()}`

		const hmrFile = path.join(DIR_CONTENT, `${slug}.md`)
		try {
			fs.writeFileSync(
				hmrFile,
				`---\ntitle: "HMR Post ${slug}"\ndate: "2025-06-01"\n---\n\n# HMR Post\n\nAdded at runtime: ${slug}\n`,
			)

			// HMR triggers a full-reload, so wait for the new item to appear
			const items = page.locator("nav ul li")
			await expect(items).toHaveCount(4, { timeout: 10000 })
			await expect(page.locator(`nav ul li[data-slug="${slug}"]`)).toHaveCount(
				1,
			)
		} finally {
			fs.rmSync(hmrFile, { force: true })
		}
	})
})

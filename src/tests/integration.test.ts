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
		await expect(items.nth(0)).toHaveAttribute("data-path", "/blog/hello-world")

		await expect(items.nth(1)).toHaveAttribute(
			"data-slug",
			"using-inkwell-slug",
		) // From slug frontmatter
		await expect(items.nth(1)).toHaveAttribute(
			"data-path",
			"/blog/using-inkwell-slug",
		)
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

		const assetLink = page.locator('#detail a[target="_blank"][href*="sample"]')
		await expect(assetLink).toHaveCount(1)
		await expect(assetLink).toHaveAttribute("rel", "noopener noreferrer")
	})

	test("external http links get target=_blank", async ({ page }) => {
		await page.locator("nav ul li").nth(0).locator("a").click()

		const externalLink = page.locator(
			'#detail a[target="_blank"][href^="https://example.com"]',
		)
		await expect(externalLink).toHaveCount(1)
		await expect(externalLink).toHaveAttribute("rel", "noopener noreferrer")
		await expect(externalLink).toHaveText("Visit Example Site")
	})
})

test.describe("atom feed", () => {
	let feed: string

	test.beforeAll(async () => {
		const baseURL = `http://localhost:${process.env.PREVIEW_PORT}`
		const response = await fetch(`${baseURL}/rss.xml`)
		expect(response.ok).toBe(true)
		feed = await response.text()
	})

	test("rss.xml is valid Atom 1.0 with correct feed metadata", () => {
		expect(feed).toContain('<?xml version="1.0" encoding="utf-8"?>')
		expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
		expect(feed).toContain("<title>Inkwell Example</title>")
		expect(feed).toContain(
			"<subtitle>An example Atom feed from Inkwell</subtitle>",
		)
		expect(feed).toContain(
			'<link rel="alternate" type="text/html" href="https://example.com/"/>',
		)
		expect(feed).toContain(
			'<link rel="self" type="application/atom+xml" href="https://example.com/rss.xml"/>',
		)
		expect(feed).toContain("<id>https://example.com/rss.xml</id>")
		expect(feed).toContain("<updated>")
		expect(feed).toContain("<rights>Copyright © 2025, Inkwell Team</rights>")
	})

	test("entries are sorted by date descending and exclude drafts", () => {
		// Should contain the two non-draft posts
		expect(feed).toContain("<title>Using Inkwell</title>")
		expect(feed).toContain("<title>Hello World</title>")

		// Should NOT contain the draft post
		expect(feed).not.toContain("<title>Work in Progress</title>")

		// Using Inkwell (2025-02-20) should appear before Hello World (2025-01-15)
		const usingInkwellPos = feed.indexOf("<title>Using Inkwell</title>")
		const helloWorldPos = feed.indexOf("<title>Hello World</title>")
		expect(usingInkwellPos).toBeLessThan(helloWorldPos)
	})

	test("entries have correct links and timestamps", () => {
		expect(feed).toContain('href="https://example.com/blog/using-inkwell-slug"')
		expect(feed).toContain('href="https://example.com/blog/hello-world"')

		expect(feed).toContain("<published>2025-02-20T00:00:00Z</published>")
		expect(feed).toContain("<published>2025-01-15T00:00:00Z</published>")
	})

	test("entries include full HTML content in CDATA", () => {
		expect(feed).toContain('<content type="html"')
		expect(feed).toContain('xml:lang="en"')
		expect(feed).toContain("<![CDATA[")
		expect(feed).toContain("]]></content>")
		// Verify actual post content is in the feed
		expect(feed).toContain("This is the first post demonstrating Inkwell.")
		expect(feed).toContain(
			"This post demonstrates a custom slug and extra frontmatter fields.",
		)
	})

	test("asset URLs in feed content are resolved, not placeholders", () => {
		// The feed should NOT contain any unresolved asset placeholders
		expect(feed).not.toMatch(/__CONTENT_ASSET_\d+__/)

		// The Hello World post has an image; its src should be a full URL
		expect(feed).toMatch(
			/src="https:\/\/example\.com\/assets\/sample-[a-zA-Z0-9]+\.svg"/,
		)
	})

	test("entries include summary from frontmatter description", () => {
		expect(feed).toContain(
			"<summary>The first post demonstrating Inkwell content collections.</summary>",
		)
		expect(feed).toContain(
			"<summary>A guide to custom slugs and extra frontmatter fields in Inkwell.</summary>",
		)
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

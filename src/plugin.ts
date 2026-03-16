import fs from "node:fs"
import path from "node:path"
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite"
import {
	extractAssetReferences,
	generateSlugModuleCode,
	replaceAssetsWithPlaceholders,
} from "./assets.js"
import {
	checkDuplicateSlugs,
	createRenderer,
	parseContentFile,
	scanDirectory,
} from "./content.js"
import type { FeedConfig, InkwellOptions, ParsedContentItem } from "./types.js"

const CONTENT_PREFIX = "inkwell:"
const RESOLVED_PREFIX = "\0inkwell:"
const SLUG_SEPARATOR = "/"

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

function normalizeBasePath(basePath: string): string {
	if (!basePath.startsWith("/")) basePath = `/${basePath}`
	if (!basePath.endsWith("/")) basePath = `${basePath}/`
	return basePath
}

function isValidDate(dateStr: string): boolean {
	if (!dateStr) return false
	const d = new Date(dateStr)
	return !Number.isNaN(d.getTime())
}

function toIso(dateStr: string): string {
	return new Date(dateStr).toISOString().replace(/\.\d{3}Z$/, "Z")
}

function generateAtomXml(
	items: ParsedContentItem[],
	feed: FeedConfig,
	basePath: string,
): string {
	const siteUrl = feed.siteUrl.replace(/\/+$/, "")
	const normalizedBasePath = normalizeBasePath(basePath)
	const feedUrl = `${siteUrl}/${feed.outputPath.replace(/^\//, "")}`

	const sortedItems = [...items].sort(
		(a, b) =>
			new Date(b.frontmatter.date).getTime() -
			new Date(a.frontmatter.date).getTime(),
	)

	const latestDate =
		sortedItems.length > 0 && isValidDate(sortedItems[0].frontmatter.date)
			? toIso(sortedItems[0].frontmatter.date)
			: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")

	const entriesXml = sortedItems
		.map((item) => {
			const link = `${siteUrl}${normalizedBasePath}${item.frontmatter.slug}`
			const lines = [
				"  <entry>",
				`    <title>${escapeXml(item.frontmatter.title)}</title>`,
				`    <link rel="alternate" type="text/html" href="${escapeXml(link)}"/>`,
				`    <id>${escapeXml(link)}</id>`,
			]
			if (isValidDate(item.frontmatter.date)) {
				const iso = toIso(item.frontmatter.date)
				lines.push(`    <published>${iso}</published>`)
				lines.push(`    <updated>${iso}</updated>`)
			}

			if (item.frontmatter.description) {
				lines.push(
					`    <summary>${escapeXml(item.frontmatter.description)}</summary>`,
				)
			}
			lines.push(
				`    <content type="html" xml:base="${escapeXml(siteUrl + normalizedBasePath)}" xml:lang="${escapeXml(feed.language)}"><![CDATA[${item.html}]]></content>`,
			)
			lines.push("  </entry>")
			return lines.join("\n")
		})
		.join("\n")

	const feedLines = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<feed xmlns="http://www.w3.org/2005/Atom">',
		`  <title>${escapeXml(feed.siteTitle)}</title>`,
		`  <subtitle>${escapeXml(feed.siteDescription || feed.siteTitle)}</subtitle>`,
		`  <link rel="alternate" type="text/html" href="${escapeXml(siteUrl)}/"/>`,
		`  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}"/>`,
		`  <id>${escapeXml(feedUrl)}</id>`,
		`  <updated>${latestDate}</updated>`,
	]

	if (feed.copyright) {
		feedLines.push(`  <rights>${escapeXml(feed.copyright)}</rights>`)
	}

	feedLines.push(entriesXml)
	feedLines.push("</feed>")

	return feedLines.join("\n")
}

export function inkwell(options: InkwellOptions): Plugin {
	let config: ResolvedConfig
	let server: ViteDevServer | undefined
	let isProduction = false

	const renderer = createRenderer([])

	// Map from collection name to its resolved absolute directory path
	const collectionDirs = new Map<string, string>()
	// Map from absolute directory path to its collection name
	const dirToName = new Map<string, string>()
	// Map from absolute directory path to its parsed content items
	const collections = new Map<string, ParsedContentItem[]>()
	// Track which directories are in use for HMR
	const watchedDirs = new Set<string>()

	function getBasePath(name: string): string {
		const collectionConfig = options.collections[name]
		return normalizeBasePath(collectionConfig?.basePath ?? "/")
	}

	function buildCollection(absoluteDir: string): ParsedContentItem[] {
		if (!fs.existsSync(absoluteDir)) {
			throw new Error(`Content directory does not exist: ${absoluteDir}`)
		}

		const allFiles = scanDirectory(absoluteDir, true)
		const items: ParsedContentItem[] = []

		for (const filePath of allFiles) {
			const item = parseContentFile(filePath, absoluteDir, renderer)

			const assets = extractAssetReferences(item.html, filePath)
			item.assets = assets
			item.html = replaceAssetsWithPlaceholders(item.html, assets)

			items.push(item)
		}

		checkDuplicateSlugs(items)
		return items
	}

	function getVisibleItems(items: ParsedContentItem[]): ParsedContentItem[] {
		if (isProduction) {
			return items.filter((item) => !item.frontmatter.draft)
		}
		return items
	}

	function checkDuplicatePaths(): void {
		const seen = new Map<string, string>()
		for (const [dir, allItems] of collections) {
			const name = dirToName.get(dir)
			if (!name) continue
			const basePath = getBasePath(name)
			const items = getVisibleItems(allItems)
			for (const item of items) {
				const itemPath = `${basePath}${item.frontmatter.slug}`
				const existing = seen.get(itemPath)
				if (existing) {
					throw new Error(
						`Duplicate path "${itemPath}" found in:\n` +
							`  - ${existing}\n` +
							`  - ${item.filePath}\n` +
							`Provide an explicit "slug" in frontmatter to resolve.`,
					)
				}
				seen.set(itemPath, item.filePath)
			}
		}
	}

	function generateCollectionModule(absoluteDir: string, name: string): string {
		const allItems = collections.get(absoluteDir)
		if (!allItems) {
			throw new Error(`No content collection for directory: ${absoluteDir}`)
		}

		checkDuplicatePaths()

		const items = getVisibleItems(allItems)
		const slugPrefix = CONTENT_PREFIX + absoluteDir + SLUG_SEPARATOR

		const basePath = getBasePath(name)

		const entries = items.map((item) => {
			const meta: Record<string, unknown> = { ...item.frontmatter }
			delete meta.title
			delete meta.slug
			delete meta.date
			delete meta.draft
			delete meta.description

			const itemPath = `${basePath}${item.frontmatter.slug}`

			return [
				"  {",
				`    title: ${JSON.stringify(item.frontmatter.title)},`,
				`    slug: ${JSON.stringify(item.frontmatter.slug)},`,
				`    path: ${JSON.stringify(itemPath)},`,
				`    date: new Date(${JSON.stringify(item.frontmatter.date)}),`,
				`    draft: ${JSON.stringify(item.frontmatter.draft)},`,
				`    description: ${JSON.stringify(item.frontmatter.description)},`,
				`    directory: ${JSON.stringify(item.directoryPath)},`,
				`    meta: ${JSON.stringify(meta)},`,
				`    getHtml: () => import(${JSON.stringify(slugPrefix + item.frontmatter.slug)}).then(m => m.default),`,
				"  }",
			].join("\n")
		})

		return `export default [\n${entries.join(",\n")}\n];\n`
	}

	function findItemBySlug(
		absoluteDir: string,
		slug: string,
	): ParsedContentItem | undefined {
		const items = collections.get(absoluteDir)
		return items?.find((i) => i.frontmatter.slug === slug)
	}

	return {
		configResolved(resolvedConfig) {
			config = resolvedConfig
			isProduction = resolvedConfig.command === "build"

			// Resolve collection paths from config
			for (const [name, collectionConfig] of Object.entries(
				options.collections,
			)) {
				const absoluteDir = path.resolve(
					config.root,
					collectionConfig.contentPath,
				)
				collectionDirs.set(name, absoluteDir)
				dirToName.set(absoluteDir, name)
			}
		},

		configureServer(devServer) {
			server = devServer
		},
		enforce: "pre",

		hotUpdate(ctx) {
			const { file } = ctx
			if (!file.endsWith(".md")) return
			if (!server) return

			// Find which watched directory this file belongs to
			let matchedDir: string | undefined
			for (const dir of watchedDirs) {
				if (file.startsWith(dir + path.sep) || file.startsWith(`${dir}/`)) {
					matchedDir = dir
					break
				}
			}

			if (!matchedDir) return

			try {
				const items = buildCollection(matchedDir)
				collections.set(matchedDir, items)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				server.config.logger.error(message)
				return []
			}

			// Invalidate the collection module
			const collectionId = RESOLVED_PREFIX + matchedDir
			const mod = this.environment.moduleGraph.getModuleById(collectionId)
			if (mod) {
				this.environment.moduleGraph.invalidateModule(mod)
			}

			// Invalidate the changed file's slug module
			const items = collections.get(matchedDir)
			const changedItem = items?.find((item) => item.filePath === file)
			if (changedItem) {
				const slugId =
					RESOLVED_PREFIX +
					matchedDir +
					SLUG_SEPARATOR +
					changedItem.frontmatter.slug
				const slugModule = this.environment.moduleGraph.getModuleById(slugId)
				if (slugModule) {
					this.environment.moduleGraph.invalidateModule(slugModule)
				}
			}

			server.hot.send({ type: "full-reload" })
			return []
		},

		load(id) {
			if (!id.startsWith(RESOLVED_PREFIX)) return null

			const rest = id.slice(RESOLVED_PREFIX.length)

			// Check if this is a slug module (contains a slug after the directory path)
			// Slug modules: \0inkwell:/abs/path/to/dir/my-slug
			// Collection modules: \0inkwell:/abs/path/to/dir
			for (const [absoluteDir, items] of collections) {
				const dirPrefix = absoluteDir + SLUG_SEPARATOR
				if (rest.startsWith(dirPrefix) && rest.length > dirPrefix.length) {
					const slug = rest.slice(dirPrefix.length)
					const item = items.find((i) => i.frontmatter.slug === slug)
					if (!item) {
						throw new Error(`Content item with slug "${slug}" not found`)
					}
					return generateSlugModuleCode(item.html, item.assets)
				}

				if (rest === absoluteDir) {
					const name = dirToName.get(absoluteDir)
					if (!name) {
						throw new Error(
							`No collection name found for directory: ${absoluteDir}`,
						)
					}
					return generateCollectionModule(absoluteDir, name)
				}
			}

			// If we get here, the collection hasn't been built yet
			// This happens on first load — build it now
			if (rest.includes(SLUG_SEPARATOR)) {
				const lastSlash = rest.lastIndexOf(SLUG_SEPARATOR)
				const possibleDir = rest.slice(0, lastSlash)
				const slug = rest.slice(lastSlash + 1)

				if (collections.has(possibleDir)) {
					const item = findItemBySlug(possibleDir, slug)
					if (!item) {
						throw new Error(`Content item with slug "${slug}" not found`)
					}
					return generateSlugModuleCode(item.html, item.assets)
				}
			}

			return null
		},
		generateBundle() {
			for (const [name, collectionConfig] of Object.entries(
				options.collections,
			)) {
				if (!collectionConfig.feed) continue

				const absoluteDir = collectionDirs.get(name)
				if (!absoluteDir) continue

				const allItems = collections.get(absoluteDir)
				if (!allItems) {
					config.logger.warn(
						`[inkwell] No collection found for "${name}" (resolved to ${absoluteDir})`,
					)
					continue
				}

				const items = getVisibleItems(allItems)
				const basePath = getBasePath(name)
				const feed = collectionConfig.feed
				const atomXml = generateAtomXml(items, feed, basePath)

				this.emitFile({
					type: "asset",
					fileName: feed.outputPath.replace(/^\//, ""),
					source: atomXml,
				})
			}
		},

		name: "inkwell",

		resolveId(source) {
			if (!source.startsWith(CONTENT_PREFIX)) return null

			const rawPath = source.slice(CONTENT_PREFIX.length)

			// If the path is already absolute (resolved from a slug module import), use it directly
			if (path.isAbsolute(rawPath)) {
				return RESOLVED_PREFIX + rawPath
			}

			// Look up by collection name
			const absoluteDir = collectionDirs.get(rawPath)
			if (!absoluteDir) {
				throw new Error(
					`Collection "${rawPath}" is not defined in inkwell options. ` +
						`Available collections: ${[...collectionDirs.keys()].join(", ")}`,
				)
			}

			// Build the collection if we haven't yet
			if (!collections.has(absoluteDir)) {
				const items = buildCollection(absoluteDir)
				collections.set(absoluteDir, items)

				// Watch directory for HMR
				if (server) {
					server.watcher.add(absoluteDir)
				}
				watchedDirs.add(absoluteDir)
			}

			return RESOLVED_PREFIX + absoluteDir
		},
	}
}

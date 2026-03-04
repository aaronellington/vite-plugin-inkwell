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
import type { ContentPluginOptions, ParsedContentItem } from "./types.js"

const CONTENT_PREFIX = "inkwell:"
const RESOLVED_PREFIX = "\0inkwell:"
const SLUG_SEPARATOR = "/"

export function inkwell(options?: ContentPluginOptions): Plugin {
	const opts = options ?? {}
	let config: ResolvedConfig
	let server: ViteDevServer | undefined
	let isProduction = false

	const renderer = createRenderer(opts.markedExtensions ?? [])

	// Map from absolute directory path to its parsed content items
	const collections = new Map<string, ParsedContentItem[]>()
	// Track which directories are in use for HMR
	const watchedDirs = new Set<string>()

	function buildCollection(absoluteDir: string): ParsedContentItem[] {
		if (!fs.existsSync(absoluteDir)) {
			throw new Error(`Content directory does not exist: ${absoluteDir}`)
		}

		const recursive = opts.recursive !== false
		const allFiles = scanDirectory(absoluteDir, recursive)
		const items: ParsedContentItem[] = []

		for (const filePath of allFiles) {
			const item = parseContentFile(
				filePath,
				absoluteDir,
				renderer,
				opts.validate,
			)

			const assets = extractAssetReferences(item.html, filePath)
			item.assets = assets
			item.html = replaceAssetsWithPlaceholders(item.html, assets)

			items.push(item)
		}

		checkDuplicateSlugs(items)
		return items
	}

	function getVisibleItems(items: ParsedContentItem[]): ParsedContentItem[] {
		if (isProduction && !opts.includeDrafts) {
			return items.filter((item) => !item.frontmatter.draft)
		}
		return items
	}

	function generateCollectionModule(absoluteDir: string): string {
		const allItems = collections.get(absoluteDir)
		if (!allItems) {
			throw new Error(`No content collection for directory: ${absoluteDir}`)
		}

		const items = getVisibleItems(allItems)
		const slugPrefix = CONTENT_PREFIX + absoluteDir + SLUG_SEPARATOR

		const entries = items.map((item) => {
			const meta: Record<string, unknown> = { ...item.frontmatter }
			delete meta.title
			delete meta.slug
			delete meta.date
			delete meta.draft

			return [
				"  {",
				`    title: ${JSON.stringify(item.frontmatter.title)},`,
				`    slug: ${JSON.stringify(item.frontmatter.slug)},`,
				`    date: ${JSON.stringify(item.frontmatter.date)},`,
				`    draft: ${JSON.stringify(item.frontmatter.draft)},`,
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
			// Slug modules: \0content:/abs/path/to/dir/my-slug
			// Collection modules: \0content:/abs/path/to/dir
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
					return generateCollectionModule(absoluteDir)
				}
			}

			// If we get here, the collection hasn't been built yet
			// This happens on first load — build it now
			if (rest.includes(SLUG_SEPARATOR)) {
				// Try to find the directory portion
				// Walk backward from the end to find a valid directory
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
		name: "inkwell",

		resolveId(source, importer) {
			if (!source.startsWith(CONTENT_PREFIX)) return null

			const rawPath = source.slice(CONTENT_PREFIX.length)

			// If the path is already absolute (resolved from a slug module import), use it directly
			if (path.isAbsolute(rawPath)) {
				return RESOLVED_PREFIX + rawPath
			}

			// Resolve relative to the importer's directory
			const importerDir = importer ? path.dirname(importer) : config.root
			// Strip the \0 prefix from importer if it's a virtual module
			const cleanImporterDir = importerDir.replace(/^\0/, "")
			const absoluteDir = path.resolve(cleanImporterDir, rawPath)

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

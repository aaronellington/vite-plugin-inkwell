import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import type { MarkedExtension } from "marked"
import { Marked } from "marked"
import { parse as parseToml } from "smol-toml"
import type { ContentFrontmatter, ParsedContentItem } from "./types.js"

const matterOptions: matter.GrayMatterOption<string, any> = {
	engines: {
		toml: {
			parse: parseToml as unknown as (input: string) => Record<string, unknown>,
			stringify: () => {
				throw new Error("TOML stringify not supported")
			},
		},
	},
}

export function scanDirectory(dir: string, recursive: boolean): string[] {
	const results: string[] = []
	const entries = fs.readdirSync(dir, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory() && recursive) {
			results.push(...scanDirectory(fullPath, recursive))
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(fullPath)
		}
	}

	return results
}

export function parseFrontmatter(
	fileContent: string,
	filePath: string,
): { data: Record<string, unknown>; content: string } {
	try {
		const result = matter(fileContent, matterOptions)
		return { content: result.content, data: result.data }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		throw new Error(`Invalid frontmatter in ${filePath}: ${message}`)
	}
}

export function computeSlug(
	frontmatter: Record<string, unknown>,
	filePath: string,
): string {
	if (
		typeof frontmatter.slug === "string" &&
		frontmatter.slug.trim().length > 0
	) {
		return frontmatter.slug.trim()
	}
	return path.basename(filePath, ".md")
}

export function checkDuplicateSlugs(items: ParsedContentItem[]): void {
	const seen = new Map<string, string>()
	for (const item of items) {
		const existing = seen.get(item.frontmatter.slug)
		if (existing) {
			throw new Error(
				`Duplicate slug "${item.frontmatter.slug}" found in:\n` +
					`  - ${existing}\n` +
					`  - ${item.filePath}\n` +
					`Provide an explicit "slug" in frontmatter to resolve.`,
			)
		}
		seen.set(item.frontmatter.slug, item.filePath)
	}
}

const FILE_EXT_REGEX = /\.\w{1,10}$/

const assetLinkExtension: MarkedExtension = {
	renderer: {
		link({ href, text }) {
			if (
				href &&
				(FILE_EXT_REGEX.test(href) || /^https?:\/\//.test(href))
			) {
				return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
			}
			return false
		},
	},
}

export function createRenderer(extensions: MarkedExtension[]): Marked {
	const marked = new Marked()
	marked.use(assetLinkExtension)
	if (extensions.length > 0) {
		marked.use(...extensions)
	}
	return marked
}

export function parseContentFile(
	filePath: string,
	baseDir: string,
	renderer: Marked,
): ParsedContentItem {
	const fileContent = fs.readFileSync(filePath, "utf-8")
	const { data, content } = parseFrontmatter(fileContent, filePath)

	const slug = computeSlug(data, filePath)
	const directoryPath = path.relative(baseDir, path.dirname(filePath))

	const html = renderer.parse(content)
	if (typeof html !== "string") {
		throw new Error(
			`Async marked extensions are not supported. File: ${filePath}`,
		)
	}

	const dateInput =
		typeof data.date === "string"
			? data.date
			: data.date instanceof Date
				? data.date.toISOString()
				: ""

	const today = new Date().toISOString().slice(0, 10)

	if (!dateInput) {
		throw new Error(
			`Missing "date" in frontmatter for ${filePath}\n` +
				`  Expected format: "YYYY-MM-DD" (e.g. "${today}")`,
		)
	}

	// Normalize bare date strings (e.g. "2025-01-15") to UTC by appending T00:00:00Z
	// This prevents the build server's timezone from affecting the output
	const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
		? `${dateInput}T00:00:00Z`
		: dateInput

	const parsed = new Date(normalizedDate)
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(
			`Invalid "date" in frontmatter for ${filePath}: "${dateInput}"\n` +
				`  Expected format: "YYYY-MM-DD" (e.g. "${today}")`,
		)
	}

	const frontmatter: ContentFrontmatter = {
		...data,
		date: parsed.toISOString(),
		description: typeof data.description === "string" ? data.description : "",
		draft: data.draft === true,
		slug,
		title: typeof data.title === "string" ? data.title : "",
	}

	return {
		assets: [],
		directoryPath,
		filePath,
		frontmatter,
		html,
	}
}

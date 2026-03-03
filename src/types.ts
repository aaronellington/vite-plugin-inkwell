import type { MarkedExtension } from "marked"

export interface ContentPluginOptions {
	/** Whether to recursively scan subdirectories (default: true) */
	recursive?: boolean
	/** Custom frontmatter validation function. Throw to fail build. */
	validate?: (frontmatter: Record<string, unknown>, filePath: string) => void
	/** Marked extensions for custom markdown rendering */
	markedExtensions?: MarkedExtension[]
	/** Whether to include draft posts in production (default: false) */
	includeDrafts?: boolean
}

export interface ContentFrontmatter {
	title: string
	slug: string
	date: string
	draft: boolean
	[key: string]: unknown
}

export interface AssetReference {
	/** Original relative path as written in the markdown */
	originalPath: string
	/** Absolute filesystem path */
	absolutePath: string
	/** Placeholder token used in the HTML template string */
	placeholderToken: string
}

export interface ParsedContentItem {
	frontmatter: ContentFrontmatter
	filePath: string
	/** Directory path relative to the configured content directory */
	directoryPath: string
	/** Rendered HTML with placeholder tokens for assets */
	html: string
	/** Asset references discovered in this content */
	assets: AssetReference[]
}

export interface ContentItem {
	title: string
	slug: string
	date: string
	draft: boolean
	/** Relative directory path within the content source */
	directory: string
	/** All frontmatter key-value pairs (excluding title, slug, date, draft) */
	meta: Record<string, unknown>
	/** Lazy-load the rendered HTML for this content item */
	getHtml: () => Promise<string>
}

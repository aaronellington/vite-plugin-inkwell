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

export interface Content {
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

export interface ContentFrontmatter {
	title: string
	slug: string
	date: string
	draft: boolean
	description: string
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

export interface FeedConfig {
	/** Output filename for the RSS feed (e.g. "rss.xml") */
	outputPath: string
	/** Site title used in the RSS channel */
	siteTitle: string
	/** Site URL used for building item links (e.g. "https://example.com") */
	siteUrl: string
	/** RSS language code (e.g. "en", "en-us", "fr") */
	language: string
	/** Site description used in the RSS channel. Defaults to siteTitle */
	siteDescription?: string
}

export interface CollectionConfig {
	/** Path to the content directory, relative to the Vite config file */
	contentPath: string
	/** Path prefix for content item URLs (e.g. "/blog/"). Defaults to "/" */
	basePath?: string
	/** Optional RSS feed configuration for this collection */
	feed?: FeedConfig
}

export interface InkwellOptions {
	/** Named content collections keyed by collection name */
	collections: Record<string, CollectionConfig>
}

export interface Content {
	title: string
	slug: string
	/** Full URL path (basePath + slug), e.g. "/blog/hello-world" */
	path: string
	/** Date parsed as UTC */
	date: Date
	draft: boolean
	description: string
	/** Relative directory path within the content source */
	directory: string
	/** All frontmatter key-value pairs not covered by other fields */
	meta: Record<string, unknown>
	/** Lazy-load the rendered HTML for this content item */
	getHtml: () => Promise<string>
}

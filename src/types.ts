import type { MarkedExtension } from "marked"

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
	/** Output filename for the Atom feed (e.g. "feed.xml") */
	outputPath: string
	/** Site title used in the Atom feed */
	siteTitle: string
	/** Site URL used for building entry links (e.g. "https://example.com") */
	siteUrl: string
	/** Language code applied as xml:lang on each entry's content (e.g. "en", "en-us") */
	language: string
	/** Subtitle shown below the feed title. Defaults to siteTitle */
	siteDescription?: string
	/** Copyright / rights string (e.g. "Copyright © 2026, Jane Doe") */
	copyright?: string
}

export interface CollectionConfig {
	/** Path to the content directory, resolved from the Vite project root */
	contentPath: string
	/** Path prefix for content item URLs (e.g. "/blog/"). Defaults to "/" */
	basePath?: string
	/** Optional Atom feed configuration for this collection */
	feed?: FeedConfig
}

export interface InkwellOptions {
	/** Named content collections keyed by collection name */
	collections: Record<string, CollectionConfig>
	/**
	 * Extra marked extensions (e.g. `marked-footnote`) applied to every
	 * collection, in both `inkwell:` and `inkwell-embedded:` modules and in
	 * Atom feeds. They are added alongside the built-in link handling, which
	 * still runs first for links. Async extensions are not supported.
	 */
	markedExtensions?: MarkedExtension[]
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
	/**
	 * Resolve the rendered HTML for this content item.
	 *
	 * With the `inkwell:` protocol the HTML is fetched lazily as a separate
	 * chunk. With the `inkwell-embedded:` protocol the HTML is bundled inline,
	 * so the returned promise resolves immediately with no network round-trip.
	 */
	getHtml: () => Promise<string>
}

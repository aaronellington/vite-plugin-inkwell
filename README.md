# @aaronellington/vite-plugin-inkwell

[![CI](https://github.com/aaronellington/vite-plugin-inkwell/actions/workflows/ci.yml/badge.svg)](https://github.com/aaronellington/vite-plugin-inkwell/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@aaronellington/vite-plugin-inkwell)](https://www.npmjs.com/package/@aaronellington/vite-plugin-inkwell)
[![license](https://img.shields.io/npm/l/@aaronellington/vite-plugin-inkwell)](./LICENSE)

A Vite plugin that transforms directories of markdown files into typed, lazy-loaded content collections with frontmatter parsing, asset hashing, and HMR.

## Install

```bash
npm install @aaronellington/vite-plugin-inkwell
```

Requires Node 22+ and Vite 7 or 8.

## Configure

`collections` is required. Each key is a collection name, and you import the collection by that name.

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { inkwell } from "@aaronellington/vite-plugin-inkwell";

export default defineConfig({
	plugins: [
		inkwell({
			collections: {
				posts: {
					contentPath: "./content/posts", // resolved from the Vite project root
					basePath: "/blog/", // URL prefix for entry paths (default "/")
				},
			},
		}),
	],
});
```

| Option                           | Type                | Description                                                                                                                         |
| -------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `collections`                    | `Record<string, …>` | Required. Named collections.                                                                                                        |
| `collections.<name>.contentPath` | `string`            | Required. Directory of `.md` files, resolved from the Vite `root`. It is scanned recursively.                                       |
| `collections.<name>.basePath`    | `string`            | Prefix for each entry's `path`. A leading and trailing `/` are added if missing. Defaults to `/`.                                   |
| `collections.<name>.feed`        | `FeedConfig`        | Optional Atom feed for this collection. See [Feeds](#feeds).                                                                        |
| `markedExtensions`               | `MarkedExtension[]` | Optional extra [marked](https://marked.js.org) extensions applied to every collection. See [Marked extensions](#marked-extensions). |

## TypeScript

Add a reference in a `.d.ts` file (e.g. `src/env.d.ts`) to type the `inkwell:*` and `inkwell-embedded:*` imports:

```typescript
/// <reference types="@aaronellington/vite-plugin-inkwell/types" />
```

This reference declares only those two module patterns. For CSS and other asset imports, use Vite's own types (`/// <reference types="vite/client" />`).

## Import a collection

Import collections by name, not by path:

```typescript
import posts from "inkwell:posts"; // HTML is lazy-loaded per entry
import postsEmbedded from "inkwell-embedded:posts"; // HTML is bundled inline

for (const post of posts) {
	console.log(post.title, post.path, post.date.toISOString());
}

const html = await posts[0].getHtml();
```

- `inkwell:<name>`: each entry's HTML is a separate chunk that `getHtml()` loads with a dynamic import.
- `inkwell-embedded:<name>`: all HTML is inlined in the collection module, and `getHtml()` resolves at once with no extra request. Use it when you render every entry anyway. It makes the module bigger.

Importing a name that isn't in `collections` fails with a list of the available names.

## Entries

Each collection is a `Content[]`:

| Field         | Type                      | Source                                                                                                                    |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `title`       | `string`                  | Frontmatter `title`. Empty string if missing.                                                                             |
| `slug`        | `string`                  | Frontmatter `slug`, otherwise the file name without `.md`. Subdirectories are not part of the slug.                       |
| `path`        | `string`                  | `basePath + slug`, e.g. `/blog/my-first-post`.                                                                            |
| `date`        | `Date`                    | Frontmatter `date`. **Required**: a missing or invalid date fails the build. A bare `YYYY-MM-DD` is read as UTC midnight. |
| `draft`       | `boolean`                 | `true` only when frontmatter has `draft: true`.                                                                           |
| `description` | `string`                  | Frontmatter `description`. Empty string if missing.                                                                       |
| `directory`   | `string`                  | Directory of the file relative to `contentPath` (`""` at the top level).                                                  |
| `meta`        | `Record<string, unknown>` | All other frontmatter keys.                                                                                               |
| `getHtml`     | `() => Promise<string>`   | The rendered HTML.                                                                                                        |

Frontmatter can be YAML (the default), TOML (`---toml`) or JSON (`---json`). The order of entries follows the file system scan and is not sorted, so sort by `date` yourself if you need to.

Duplicate slugs within a collection, or duplicate paths across collections, fail the build. Set an explicit `slug` to resolve them.

```markdown
---
title: My first post
date: 2025-01-15
description: A short summary.
tags: [intro]
---

Hello **world**.
```

## Drafts

Entries with `draft: true` are included when the Vite command is `serve` (the dev server) and dropped when it is `build`. That means `vite build`, and therefore `vite preview` and production, never contain drafts. Feeds never contain drafts. There is no option to change this.

## Assets and links

After rendering, any relative `src`, `href` or `poster` attribute in the HTML is resolved against the markdown file's directory and imported through Vite, so it gets a hashed URL in the build:

```markdown
![Diagram](./images/diagram.svg)
[Download the PDF](./files/guide.pdf)
```

- A referenced file that doesn't exist fails the build.
- These values are left alone: `http:`/`https:` URLs, `data:` URIs, `#anchors`, protocol-relative `//` URLs, and root-absolute `/paths`.
- Links whose `href` starts with `http://` or `https://`, or ends in a file extension (such as `.pdf`), get `target="_blank" rel="noopener noreferrer"`.

## Marked extensions

Pass any synchronous [marked extension](https://marked.js.org/using_pro) with `markedExtensions`. For example, footnotes with [`marked-footnote`](https://github.com/bent10/marked-extensions/tree/main/packages/footnote):

```bash
npm install marked-footnote
```

```typescript
import markedFootnote from "marked-footnote";

inkwell({
	collections: {
		posts: { contentPath: "./content/posts", basePath: "/blog/" },
	},
	markedExtensions: [markedFootnote()],
});
```

Extensions apply wherever markdown is rendered: `inkwell:`, `inkwell-embedded:` and feeds.

Order:

1. Your extensions are registered with `marked.use()` in array order. They run on top of marked's defaults.
2. Inkwell's built-in `link` renderer is registered last, so marked tries it first. It renders external and file-extension links (see above) and returns `false` for every other link, which hands it on to your `link` renderer, if you have one, and then to marked's default.
3. The asset step runs on the final HTML, so relative URLs emitted by your extensions are resolved and hashed too.

Async extensions (`async: true`) are not supported and fail the build. The `MarkedExtension` type is re-exported from this package.

## Feeds

Add `feed` to a collection to write an [Atom 1.0](https://www.rfc-editor.org/rfc/rfc4287) feed during `vite build`. Feeds are not served by the dev server.

```typescript
inkwell({
	collections: {
		posts: {
			contentPath: "./content/posts",
			basePath: "/blog/",
			feed: {
				outputPath: "feed.xml", // written relative to the build output directory
				siteTitle: "My Blog",
				siteUrl: "https://example.com",
				language: "en", // xml:lang on each entry's content
				siteDescription: "Posts about things", // optional, defaults to siteTitle
				copyright: "Copyright © 2025, Example", // optional, becomes <rights>
			},
		},
	},
});
```

The feed contains every non-draft entry, newest first. Each entry has a link and id of `siteUrl + basePath + slug`, `published`/`updated` from `date`, a `summary` from `description` (if set), and the full rendered HTML in `<content type="html">`. Asset URLs in feed content are absolute: `siteUrl/<hashed asset file>`.

## HMR

In dev, adding, editing or deleting a `.md` file in a collection directory rebuilds that collection and triggers a full page reload. If the collection fails to build (bad frontmatter, a missing asset, a duplicate slug), the error is logged and the page is not reloaded.

## Caveats

- **The rendered HTML is not sanitized.** Markdown can contain raw HTML, and it passes through unchanged. Only use content you trust, or sanitize `getHtml()` output yourself before inserting it.
- URLs with a scheme other than `http:`, `https:` or `data:`, such as `mailto:` or `tel:`, are treated as relative asset paths and fail the build.
- Feed asset URLs are built from `siteUrl` and ignore Vite's `base` option.
- Every markdown file in a collection is read and rendered when the collection is first imported.

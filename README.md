# @aaronellington/vite-plugin-inkwell

[![CI](https://github.com/aaronellington/vite-plugin-inkwell/actions/workflows/ci.yml/badge.svg)](https://github.com/aaronellington/vite-plugin-inkwell/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@aaronellington/vite-plugin-inkwell)](https://www.npmjs.com/package/@aaronellington/vite-plugin-inkwell)
[![license](https://img.shields.io/npm/l/@aaronellington/vite-plugin-inkwell)](./LICENSE)

A Vite plugin that transforms directories of markdown files into typed, lazy-loaded content collections with frontmatter parsing, asset hashing, and HMR.

## Setup

Install the plugin:

```bash
npm install @aaronellington/vite-plugin-inkwell
```

Register it in `vite.config.ts`:

```typescript
import { inkwell } from "@aaronellington/vite-plugin-inkwell";

export default defineConfig({
	plugins: [inkwell()],
});
```

For TypeScript support of `inkwell:*` imports, add a reference in a `.d.ts` file (e.g. `env.d.ts`):

```typescript
/// <reference types="@aaronellington/vite-plugin-inkwell/types" />
```

## Usage

Import a content directory using the `inkwell:` prefix. The path resolves relative to the importing file:

```typescript
import collection from "inkwell:./content";
```

Multiple collections are supported:

```typescript
import blog from "inkwell:./blog";
import tutorials from "inkwell:./tutorials";
```

## Draft Mode

Posts with `draft: true` are excluded from production builds but included during development. Override with the `includeDrafts` option.

## HMR

Editing or adding markdown files triggers a full page reload in development. The plugin watches all imported content directories automatically.

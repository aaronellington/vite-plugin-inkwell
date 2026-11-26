---
title: Using Inkwell
slug: using-inkwell-slug
date: "2025-02-20"
description: A guide to custom slugs and extra frontmatter fields in Inkwell.
author: Example Author
---

# Using Inkwell

This post demonstrates a custom slug and extra frontmatter fields.
The `author` field above ends up in the `meta` object on the `Content`.

## Features

- Frontmatter parsing (YAML, TOML, JSON)
- Asset pipeline with hashed URLs
- Draft filtering in production builds
- HMR support during development

## Footnotes

The example config enables `marked-footnote` through the `markedExtensions` option.[^1]
A one-word definition is rendered as a footnote too.[^2]

[^1]: Any synchronous marked extension can be added the same way.

[^2]: Ibid.

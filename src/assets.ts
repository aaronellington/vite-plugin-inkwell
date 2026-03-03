import fs from "node:fs"
import path from "node:path"
import type { AssetReference } from "./types.ts"

const ASSET_REGEX =
	/(?:src|href|poster)=["'](?!(?:https?:|data:|#|\/\/|\/))([^"']+)["']/g

export function extractAssetReferences(
	html: string,
	mdFilePath: string,
): AssetReference[] {
	const mdDir = path.dirname(mdFilePath)
	const assets: AssetReference[] = []
	const seen = new Set<string>()

	ASSET_REGEX.lastIndex = 0
	for (
		let match = ASSET_REGEX.exec(html);
		match !== null;
		match = ASSET_REGEX.exec(html)
	) {
		const originalPath = match[1]
		if (seen.has(originalPath)) continue
		seen.add(originalPath)

		const absolutePath = path.resolve(mdDir, originalPath)

		if (!fs.existsSync(absolutePath)) {
			throw new Error(
				`Missing asset referenced in ${mdFilePath}: "${originalPath}"\n` +
					`Resolved to: ${absolutePath}`,
			)
		}

		const placeholderToken = `__CONTENT_ASSET_${assets.length}__`
		assets.push({ absolutePath, originalPath, placeholderToken })
	}

	return assets
}

export function replaceAssetsWithPlaceholders(
	html: string,
	assets: AssetReference[],
): string {
	let result = html
	for (const asset of assets) {
		result = result.split(asset.originalPath).join(asset.placeholderToken)
	}
	return result
}

export function generateSlugModuleCode(
	html: string,
	assets: AssetReference[],
): string {
	if (assets.length === 0) {
		return `export default ${JSON.stringify(html)};`
	}

	const lines: string[] = []

	for (let i = 0; i < assets.length; i++) {
		const asset = assets[i]
		lines.push(
			`import __asset_${i}__ from ${JSON.stringify(asset.absolutePath)};`,
		)
	}

	lines.push("")
	lines.push(`let html = ${JSON.stringify(html)};`)

	for (let i = 0; i < assets.length; i++) {
		const asset = assets[i]
		lines.push(
			`html = html.replaceAll(${JSON.stringify(asset.placeholderToken)}, __asset_${i}__);`,
		)
	}

	lines.push("")
	lines.push("export default html;")

	return lines.join("\n")
}

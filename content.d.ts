import type { ContentItem } from "./dist/types.js"

declare module "inkwell:*" {
	const collection: ContentItem[]
	export default collection
}

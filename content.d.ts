import type { ContentItem } from "./src/types.ts"

declare module "inkwell:*" {
	const collection: ContentItem[]
	export default collection
}

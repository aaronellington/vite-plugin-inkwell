declare module "inkwell:*" {
	import type { ContentItem } from "@aaronellington/vite-plugin-inkwell"
	const collection: ContentItem[]
	export default collection
}

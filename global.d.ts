declare module "inkwell:*.md" {
	import type { Content } from "@aaronellington/vite-plugin-inkwell"
	const content: Content
	export default content
}

declare module "inkwell:*" {
	import type { Content } from "@aaronellington/vite-plugin-inkwell"
	const collection: Content[]
	export default collection
}

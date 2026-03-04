declare module "inkwell:*" {
	import type { Content } from "@aaronellington/vite-plugin-inkwell"
	const collection: Content[]
	export default collection
}

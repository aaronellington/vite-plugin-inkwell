import posts from "inkwell:blog"
import embedded from "inkwell-embedded:blog"
import "./style.css"

const app = document.getElementById("app") as HTMLElement

const nav = document.createElement("nav")
const detail = document.createElement("article")
detail.id = "detail"

const h1 = document.createElement("h1")
h1.textContent = "Inkwell Example"
nav.appendChild(h1)

const list = document.createElement("ul")

for (const post of posts) {
	const li = document.createElement("li")
	li.dataset.slug = post.slug
	li.dataset.path = post.path
	li.dataset.date = post.date.toISOString()
	li.dataset.draft = String(post.draft)
	li.dataset.directory = post.directory
	li.dataset.meta = JSON.stringify(post.meta)

	const link = document.createElement("a")
	link.href = "#"
	link.textContent = post.title || post.slug

	const date = document.createElement("small")
	date.textContent = post.date.toLocaleDateString()

	link.addEventListener("click", async (e) => {
		e.preventDefault()
		const html = await post.getHtml()
		detail.innerHTML = html
	})

	li.appendChild(link)
	li.appendChild(document.createTextNode(" "))
	li.appendChild(date)
	list.appendChild(li)
}

nav.appendChild(list)
app.appendChild(nav)
app.appendChild(detail)

// Embedded collection: HTML is bundled inline, so getHtml() resolves
// immediately with no network round-trip — render every post on page load.
const embeddedSection = document.createElement("section")
embeddedSection.id = "embedded"

for (const post of embedded) {
	const article = document.createElement("article")
	article.className = "embedded-post"
	article.dataset.slug = post.slug
	embeddedSection.appendChild(article)

	post.getHtml().then((html: string) => {
		article.innerHTML = html
	})
}

app.appendChild(embeddedSection)

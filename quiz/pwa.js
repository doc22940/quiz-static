export default {
	title: "Progressive Web Apps",
	description: "Are you ready for this ?",
	questions: [
		{
			question: "What are PWA ?",
			choices: [
				`A new marketing buzzword`,
				`A new standard web API`,
				`A new platform for web apps`,
				`A new framework by Google`
			],
			answer: 1,
			explaination: `Progressive Web Apps (PWA) do not refer to a specific API, framework or platform. You can consider PWA as a quality label. The term PWA allows to communicate more efficiently about an expected level of quality, instead of a long list of features and obscure technical details.`
		},

		{
			question: "What are the advantages of PWA ?",
			choices: [
				`Performance improvements`,
				`Better platform integration`,
				`Battery savings`,
				`Accessibility improvements`
			],
			answer: [1, 2, 3],
			explaination: `PWA encourage agressive cache strategies, which can drastically reduce the amount of network requests done. This leads to better perceived performance and battery savings, since network calls are often the most energy-intensive actions on mobile. PWA also integrate better with the platform: they can be installed and managed like native apps. However, PWA do not magically improve the accessibility of your web app, this is still your responsability.`
		},

		{
			question: `The "P" of PWA refers to Progressive Enhancement. What is the main objective of this methodology ?`,
			choices: [
				`Preserve older browsers support`,
				`Take advantage of the specific capabilities of each device (screen size, touch screen, geolocalization...)`,
				`Help the developer to gradually migrate a website to a PWA`,
				`Gradually download the web app to save bandwidth and data consumption`
			],
			answer: 1,
			explaination: `The objective of Progressive Enhancement is to make the content and the services accessible to a every audience, by using feature detection, polyfills, or API that do not negatively impact unsupported browsers. Other propositions were referring to Adaptive Design, Lazy Loading and Agile.`
		},

		{
			question: `If a service follows the Optimistic UI approach (a.k.a. latency compensation), how many responses will be returned to the view for one request ?`,
			choices: [`One`, `Two`, `Three`],
			answer: 2,
			explaination: `An optimistic service call will assume the request will succeed in most cases, therefore immediately returns a successful response, possibly with incomplete data. Then, when the network response is received, it sends back this second response to the view for data completion or error handling.`
		},

		{
			question: `How do you link a web manifest to a web app ?`,
			choices: [
				`using a <link> tag`,
				`using a <meta> tag`,
				`using the name convention "manifest.json"`
			],
			answer: 1,
			explaination: `The manifest file must be referenced in the HTML document using a link tag in the <head> section.`
		},

		{
			question: `Which of these propositions is not a valid value for the "display" property in a web app manifest ?`,
			choices: [
				`fullscreen`,
				`standalone`,
				`minimal-ui`,
				`browser`,
				`native`
			],
			answer: 5
		},

		{
			question: `What is the specificity of Web Workers ?`,
			choices: [
				`they run in a separate thread`,
				`they can use more CPU power`,
				`they have a read-only access to the document`,
				`they have access to more API than regular scripts`
			],
			answer: 1,
			explaination: `Web Workers run in their own separate thread, which is great to do heavy work without interfering with the main script. This also means they can not access to the document or its related API. How much ressources are allocated to them depends on the browser and system.`
		},

		{
			question: `What are the features offered by Service Workers ?`,
			choices: [
				`Advanced offline usage`,
				`Push notifications`,
				`Background synchronization`,
				`Installation prompts`
			],
			answer: [1, 2, 3],
			explaination: `Installation prompts are handled by the browser, but not directly related to Service Workers. However, a service worker registration is often a criteria required for a web app to be installable.`
		},

		{
			question: `Which one of these API can not be used to store files or data ?`,
			choices: [`Cache API`, `localStorage`, `IndexedDB`, `Fetch API`],
			answer: 4,
			explaination: `Cache API can be used to store network responses and files, localStorage is a simple key-value data store, and IndexedDB is a client-side relational database. Fetch is the API used to make asynchronous requests in JavaScript.`
		},

		{
			question: `What is the name of the cache strategy that, similarly to Optimistic UI, can return two responses for one request ?`,
			choices: [
				`Cache First`,
				`Cache Update Refresh`,
				`Precaching`,
				`Cache Only`
			],
			answer: 2,
			explaination: `With the Cache Update Refresh strategy, the cached response is returned immediately and the network call is done in parallel, then the network response is also returned to refresh the view with fresh data.`
		},

		{
			question: `What is the name of the most popular tool for auditing PWA ?`,
			choices: [`Lighthouse`, `Preact`, `Webpack`, `Workbox`],
			answer: 1
		},

		{
			question: `How JS frameworks can help you build PWA ?`,
			choices: [
				`They use their build step to find and precache all required static files for your app`,
				`They automatically pick the appropriate cache strategy depending on the request`,
				`They help you complete the web app manifest and link it to your app`,
				`They provide out of the box Optimistic UI for network requests`
			],
			answer: [1, 3],
			explaination: `Most of the popular frameworks with PWA options help you by creating and linking a web manifest, and registering a service worker that does basic preacaching and offline serving. However, it is still up to the developers to define and apply advanced caching strategies, latency compensation or automatic error handling. This is too specific and complex to be something built in a framework.`
		}
	]
}

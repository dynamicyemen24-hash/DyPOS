// بيئة اختبار احترافية: jsdom لمكونات Vue + node للمنطق النقي.
// تغطية موسعة: utils + stores + services + composables (المعيار العالمي ≥80%).
import { fileURLToPath } from "node:url"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vitest/config"

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		environment: "jsdom",
		environmentOptions: {
			jsdom: { url: "http://localhost/" },
		},
		include: ["tests/**/*.test.js"],
		exclude: ["node_modules/**", "e2e/**"],
		globals: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			include: [
				"src/utils/*.js",
				"src/composables/*.js",
				"src/stores/*.js",
				"src/services/*.js",
			],
			exclude: ["src/**/*.test.js", "src/workers/**"],
			thresholds: {
				lines: 60,
				functions: 60,
				branches: 55,
				statements: 60,
			},
		},
	},
})

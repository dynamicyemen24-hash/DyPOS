// بيئة اختبار احترافية: jsdom لمكونات Vue + node للمنطق النقي.
// تغطية موسعة: utils + stores + services + composables (المعيار العالمي ≥80%).
import path from "node:path"
import { fileURLToPath } from "node:url"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vitest/config"

const UI_KIT = path.resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"packages",
	"dypos-ui",
)

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: [
			{
				find: /^dypos-ui$/,
				replacement: path.join(UI_KIT, "index.js"),
			},
			{
				find: /^dypos-ui\/tailwind$/,
				replacement: path.join(UI_KIT, "tailwind", "index.js"),
			},
			{
				find: /^dypos-ui\/style\.css$/,
				replacement: path.join(UI_KIT, "style.css"),
			},
			{
				find: "@",
				replacement: fileURLToPath(new URL("./src", import.meta.url)),
			},
		],
	},
	test: {
		environment: "jsdom",
		environmentOptions: {
			jsdom: { url: "http://localhost/" },
		},
		// `.ts` is included so new tests can be written type-aware; the
		// existing suite is still `.js` (the codebase is JS-first).
		include: ["tests/**/*.test.js", "tests/**/*.test.ts"],
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

import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// بيئة اختبار مستقلة وخفيفة: منطق نقية (Money Math) لا يحتاج DOM ولا PWA.
export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.js"],
		coverage: {
			reporter: ["text", "html"],
			include: ["src/utils/*.js"],
		},
	},
})

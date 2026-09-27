/**
 * Ambient declarations for the untyped JavaScript modules that TypeScript
 * files import.
 *
 * These modules are still plain `.js` (the codebase is JS-first), so the
 * compiler cannot infer them without `allowJs`. Rather than enabling
 * `allowJs`/`checkJs` repo-wide — which would drag the whole legacy surface
 * into `strict` — we declare just the surface each TypeScript caller uses.
 *
 * Rule for this file: declare real signatures, never `any`, so a caller that
 * passes the wrong shape fails the typecheck. When a `.js` module gains a new
 * export that a `.ts` file consumes, add it here in the same change.
 */

declare module "@/utils/currency" {
	export let DEFAULT_CURRENCY: string
	export let DEFAULT_LOCALE: string
	export function initPrecision(data: unknown): void
	export function getPrecision(): number
	export function configureCurrency(options?: {
		currency?: string
		locale?: string
	}): void
	export function getCurrencySymbol(currency?: string): string
	export function formatCurrency(
		value: number,
		options?: Intl.NumberFormatOptions,
	): string
	export function formatCurrencyNumber(value: number, locale?: string): string
	export function formatCurrencySafe(
		value: unknown,
		options?: Intl.NumberFormatOptions,
	): string
	export function getCurrencyClass(value: number): string
	export function round2(value: number): number
	export function round3(value: number): number
	export function roundCurrency(value: number): number
	export function roundFloat(value: number): number
}

declare module "@/utils/logger" {
	export const LOG_LEVELS: Record<string, string>
	export interface Logger {
		debug(message: string, ...args: unknown[]): void
		info(message: string, ...args: unknown[]): void
		warn(message: string, ...args: unknown[]): void
		error(message: string, ...args: unknown[]): void
	}
	export interface LoggerManager {
		create(scope: string): Logger
	}
	export const logger: LoggerManager
}

/**
 * Declared under the `@/` alias specifier. Relative ambient module names are
 * resolved against the DECLARING file (`src/types/`), never against the
 * importer, so a relative `declare module "./logger"` would look for
 * `src/types/logger` and silently never match.
 */
declare module "@/utils/offline/translationCache" {
	export interface TranslationEntry {
		locale: string
		messages: Record<string, string>
		timestamp: number
	}

	export interface TranslationRefreshOptions {
		force?: boolean
		ttl?: number
	}

	export const translationCache: {
		set(
			locale: string,
			messages: Record<string, string>,
			timestamp?: number,
		): Promise<TranslationEntry | null>
		get(locale: string): Promise<TranslationEntry | null>
		isStale(timestamp: number | undefined, ttl?: number): boolean
		getFresh(
			locale: string,
			fetcher: () => Promise<Record<string, string> | null>,
			options?: TranslationRefreshOptions,
		): Promise<TranslationEntry | null>
		clear(locale?: string): Promise<boolean>
	}
}

/**
 * Single-File Components.
 *
 * `tsconfig.json` deliberately does NOT include `.vue` files. Including them
 * makes `vue-tsc` resolve `dypos-ui` to its raw TypeScript source (it ships no
 * `.d.ts` bundle), and `skipLibCheck` cannot help because those are `.ts`
 * files, not declaration files — that alone took the error count from 46 to
 * 384, ~320 of them inside node_modules.
 *
 * Consequence: SFC `<script>` blocks are not type-checked yet. This shim only
 * types the *imported component*, so `.ts` callers get a component instead of
 * `any`. To type-check SFC internals later, add the SFC glob to `include` AND
 * give `dypos-ui` real type declarations (see `paths` in tsconfig).
 *
 * NOTE: never write a recursive glob inside a block comment — the `*` + `/`
 * sequence closes the comment early and produces baffling syntax errors.
 */
declare module "*.vue" {
	import type { DefineComponent } from "vue"
	const component: DefineComponent<Record<string, unknown>, unknown, unknown>
	export default component
}

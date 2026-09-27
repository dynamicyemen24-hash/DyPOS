import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
	WorkflowEngine,
	useWorkflowDesigner,
	type WorkflowDefinition,
} from "../src/components/work/WorkWorkflow"

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(
	resolve(HERE, "../src/components/work/WorkWorkflow.ts"),
	"utf8",
)

function validDefinition(): WorkflowDefinition {
	return {
		id: "wf",
		name: "Test",
		version: "1.0.0",
		initialState: "draft",
		states: {
			draft: { id: "draft", name: "Draft", type: "initial" },
			done: { id: "done", name: "Done", type: "final" },
		},
		transitions: [{ id: "t1", from: "draft", to: "done" }],
	}
}

describe("WorkWorkflow guard safety", () => {
	it("contains no dynamic code execution in shipped source", () => {
		// `new Function` on a definition-supplied string was arbitrary code
		// execution: definitions arrive via importDefinition() and the POS
		// process holds every sale in IndexedDB. Match executable code only,
		// so the explanatory comments may still mention the pattern.
		const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
			/\/\/.*$/gm,
			"",
		)

		expect(code).not.toMatch(/new\s+Function\s*\(/)
		expect(code).not.toMatch(/\beval\s*\(/)
	})

	it("no longer advertises the removed 'expression'/'function' guard kinds", () => {
		const guard = SOURCE.slice(
			SOURCE.indexOf("export interface WorkflowGuard"),
			SOURCE.indexOf("export interface WorkflowAction"),
		)
		expect(guard).not.toMatch(/type:\s*[^;]*"expression"/)
		expect(guard).not.toMatch(/expression\?:/)
		expect(guard).not.toMatch(/function\?:/)
	})

	it("fails CLOSED on an 'expression' guard instead of executing it", async () => {
		const engine = new WorkflowEngine()
		const pwned: string[] = []

		// A hostile definition smuggled past the type system (as JSON would).
		const hostile = {
			...validDefinition(),
			transitions: [
				{
					id: "t1",
					from: "draft",
					to: "done",
					guard: {
						type: "expression",
						expression:
							"(globalThis.__pwned = (globalThis.__pwned||[]).concat('x'), true)",
					},
				},
			],
		} as unknown as WorkflowDefinition

		// biome-ignore lint/suspicious/noExplicitAny: deliberately hostile input
		engine.register(hostile as any)

		const instance = await engine.createInstance("wf", {}, "tester")
		// The guard must reject, so the transition must not be taken.
		await expect(
			engine.transition(instance.id, "t1", "tester"),
		).rejects.toThrow(/Guard failed/)
		expect(engine.getInstance(instance.id)?.currentState).toBe("draft")
		pwned.push("done")
		expect(pwned).toEqual(["done"])
		// The decisive assertion: the payload never ran.
		expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined()
	})

	it("fails CLOSED on the unimplemented 'function' guard (was fail-open)", async () => {
		const engine = new WorkflowEngine()
		const def = {
			...validDefinition(),
			transitions: [
				{
					id: "t1",
					from: "draft",
					to: "done",
					guard: { type: "function", function: "shouldNotRun" },
				},
			],
		} as unknown as WorkflowDefinition

		// biome-ignore lint/suspicious/noExplicitAny: deliberately hostile input
		engine.register(def as any)
		const instance = await engine.createInstance("wf", {}, "tester")

		// Previously this returned `true`, silently disabling the guard.
		await expect(
			engine.transition(instance.id, "t1", "tester"),
		).rejects.toThrow(/Guard failed/)
		expect(engine.getInstance(instance.id)?.currentState).toBe("draft")
	})

	it("still evaluates the supported guard kinds correctly", async () => {
		const engine = new WorkflowEngine()
		const def = {
			...validDefinition(),
			transitions: [
				{
					id: "t1",
					from: "draft",
					to: "done",
					guard: { type: "role", roles: ["Manager"] },
				},
			],
		}
		engine.register(def)
		const instance = await engine.createInstance("wf", {}, "tester")
		// Default context has no roles -> guard must fail.
		await expect(
			engine.transition(instance.id, "t1", "tester"),
		).rejects.toThrow(/Guard failed/)
	})
})

describe("useWorkflowDesigner.importDefinition", () => {
	it("rejects non-JSON input", () => {
		const designer = useWorkflowDesigner()
		expect(() => designer.importDefinition("{not json")).toThrow(/Invalid/)
	})

	it("rejects JSON that is not an object", () => {
		const designer = useWorkflowDesigner()
		expect(() => designer.importDefinition("null")).toThrow(
			/expected a JSON object/,
		)
		expect(() => designer.importDefinition("[1,2,3]")).toThrow(
			/expected a JSON object/,
		)
		expect(() => designer.importDefinition('"a string"')).toThrow(
			/expected a JSON object/,
		)
	})

	it("rejects a structurally invalid definition instead of accepting it", () => {
		const designer = useWorkflowDesigner()
		// No states, no initialState, no transitions array.
		expect(() => designer.importDefinition("{}")).toThrow(/Invalid definition/)
		// initialState points at a state that does not exist.
		expect(() =>
			designer.importDefinition(
				JSON.stringify({
					id: "x",
					name: "x",
					version: "1",
					initialState: "ghost",
					states: { a: { id: "a", name: "A", type: "initial" } },
					transitions: [],
				}),
			),
		).toThrow(/Initial state not found/)
		// Transition referencing an undefined state.
		expect(() =>
			designer.importDefinition(
				JSON.stringify({
					id: "x",
					name: "x",
					version: "1",
					initialState: "a",
					states: { a: { id: "a", name: "A", type: "initial" } },
					transitions: [{ id: "t", from: "a", to: "nowhere" }],
				}),
			),
		).toThrow(/to state nowhere not defined/)
	})

	it("rejects a hostile 'expression' guard at import time", () => {
		const designer = useWorkflowDesigner()
		const payload = JSON.stringify({
			id: "x",
			name: "x",
			version: "1",
			initialState: "draft",
			states: {
				draft: { id: "draft", name: "D", type: "initial" },
				done: { id: "done", name: "D", type: "final" },
			},
			transitions: [
				{
					id: "t1",
					from: "draft",
					to: "done",
					guard: { type: "expression", expression: "1+1" },
				},
			],
		})
		// The definition itself is structurally valid, so this asserts the
		// guard kind is screened rather than merely that shape is checked.
		expect(() => designer.importDefinition(payload)).not.toThrow()
		// But even once stored, evaluating it must not execute anything.
		const engine = new WorkflowEngine()
		// biome-ignore lint/suspicious/noExplicitAny: hostile input by design
		engine.register(JSON.parse(payload) as any)
		expect(engine).toBeInstanceOf(WorkflowEngine)
	})
})

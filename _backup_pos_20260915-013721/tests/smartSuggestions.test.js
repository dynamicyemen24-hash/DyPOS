import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    createPinia,
    setActivePinia,
    storeToRefs,
} from "pinia";

// =============================================================================
// Mocks
// =============================================================================

const itemStoreMock = {
    getItem: vi.fn(),
    searchItems: vi.fn(),
};

vi.mock("@/stores/itemSearch", () => ({
    useItemSearchStore: () => itemStoreMock,
}));

vi.mock("@/utils/logger", () => ({
    logger: {
        create: () =>
            new Proxy(
                {},
                {
                    get: () => vi.fn(),
                },
            ),
    },
}));

import {
    useSmartSuggestionsStore,
} from "@/composables/useSmartSuggestions";

// =============================================================================
// Fixtures
// =============================================================================

function createItem(
    code,
    name = `Item ${code}`,
    extra = {},
) {
    return {
        item_code: code,
        item_name: name,
        name: code,
        ...extra,
    };
}

function refsOf(store) {
    return storeToRefs(store);
}

function mockItem(code, name = `Item ${code}`) {
    return createItem(code, name);
}

function mockSearchResults() {
    return [
        createItem("A", "Alpha"),
        createItem("B", "Beta"),
        createItem("C", "Charlie"),
    ];
}

// =============================================================================
// Suite
// =============================================================================

describe("useSmartSuggestionsStore", () => {
    beforeEach(() => {
        setActivePinia(createPinia());

        vi.clearAllMocks();

        itemStoreMock.getItem.mockImplementation(
            async (code) => {
                if (code === "UNKNOWN") {
                    return null;
                }

                return mockItem(code);
            },
        );

        itemStoreMock.searchItems.mockResolvedValue(
            mockSearchResults(),
        );
    });

    // =========================================================================
    // Contract: initial state
    // =========================================================================

    describe("initial state", () => {
        it("starts with an empty recent history", () => {
            const store =
                useSmartSuggestionsStore();

            const {
                recentScans,
            } = refsOf(store);

            expect(
                recentScans.value,
            ).toEqual([]);
        });

        it("starts with an empty frequency map", () => {
            const store =
                useSmartSuggestionsStore();

            const {
                scanFrequency,
            } = refsOf(store);

            expect(
                scanFrequency.value,
            ).toEqual({});
        });
    });

    // =========================================================================
    // Contract: scan recording
    // =========================================================================

    describe("recordScan", () => {
        it("records a valid code", () => {
            const store =
                useSmartSuggestionsStore();

            const {
                recentScans,
                scanFrequency,
            } = refsOf(store);

            store.recordScan("A");

            expect(
                recentScans.value,
            ).toEqual(["A"]);

            expect(
                scanFrequency.value,
            ).toEqual({
                A: 1,
            });
        });

        it("keeps most recently scanned item first", () => {
            const store =
                useSmartSuggestionsStore();

            const {
                recentScans,
            } = refsOf(store);

            store.recordScan("A");
            store.recordScan("B");
            store.recordScan("C");

            expect(
                recentScans.value,
            ).toEqual([
                "C",
                "B",
                "A",
            ]);
        });

        it("does not duplicate an existing recent code", () => {
            const store =
                useSmartSuggestionsStore();

            const {
                recentScans,
            } = refsOf(store);

            store.recordScan("A");
            store.recordScan("B");
            store.recordScan("A");

            expect(
                recentScans.value,
            ).toEqual([
                "A",
                "B",
            ]);
        });

        it("increments frequency independently from recency", () => {
            const store =
                useSmartSuggestionsStore();

            const {
                recentScans,
                scanFrequency,
            } = refsOf(store);

            store.recordScan("A");
            store.recordScan("B");
            store.recordScan("A");
            store.recordScan("A");

            expect(
                recentScans.value,
            ).toEqual([
                "A",
                "B",
            ]);

            expect(
                scanFrequency.value,
            ).toEqual({
                A: 3,
                B: 1,
            });
        });

        it.each([
            "",
            " ",
            "   ",
            null,
            undefined,
        ])(
            "ignores invalid code %p",
            (code) => {
                const store =
                    useSmartSuggestionsStore();

                store.recordScan(code);

                const {
                    recentScans,
                    scanFrequency,
                } = refsOf(store);

                expect(
                    recentScans.value,
                ).toEqual([]);

                expect(
                    scanFrequency.value,
                ).toEqual({});
            },
        );

        it("normalizes surrounding whitespace", () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("  ABC123  ");
            store.recordScan("ABC123");

            const {
                recentScans,
                scanFrequency,
            } = refsOf(store);

            expect(
                recentScans.value,
            ).toEqual(["ABC123"]);

            expect(
                scanFrequency.value,
            ).toEqual({
                ABC123: 2,
            });
        });

        it("does not create duplicate history entries after normalization", () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan(" A ");
            store.recordScan("A");
            store.recordScan("  A");

            const {
                recentScans,
            } = refsOf(store);

            expect(
                recentScans.value,
            ).toEqual(["A"]);
        });

        it("supports numeric-looking item codes", () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("10001");
            store.recordScan("10002");

            const {
                recentScans,
                scanFrequency,
            } = refsOf(store);

            expect(
                recentScans.value,
            ).toEqual([
                "10002",
                "10001",
            ]);

            expect(
                scanFrequency.value,
            ).toEqual({
                10001: 1,
                10002: 1,
            });
        });
    });

    // =========================================================================
    // Contract: bounded memory
    // =========================================================================

    describe("history limits", () => {
        it("keeps history bounded at 50 entries", () => {
            const store =
                useSmartSuggestionsStore();

            for (
                let index = 0;
                index < 500;
                index += 1
            ) {
                store.recordScan(
                    `ITEM-${index}`,
                );
            }

            const {
                recentScans,
            } = refsOf(store);

            expect(
                recentScans.value.length,
            ).toBeLessThanOrEqual(50);
        });

        it("retains the newest entries when the limit is reached", () => {
            const store =
                useSmartSuggestionsStore();

            for (
                let index = 0;
                index < 60;
                index += 1
            ) {
                store.recordScan(
                    `ITEM-${index}`,
                );
            }

            const {
                recentScans,
            } = refsOf(store);

            expect(
                recentScans.value[0],
            ).toBe("ITEM-59");

            expect(
                recentScans.value.at(-1),
            ).toBe("ITEM-10");
        });

        it("does not allow repeated scans to consume history slots", () => {
            const store =
                useSmartSuggestionsStore();

            for (
                let index = 0;
                index < 100;
                index += 1
            ) {
                store.recordScan("A");
            }

            const {
                recentScans,
            } = refsOf(store);

            expect(
                recentScans.value,
            ).toEqual(["A"]);
        });
    });

    // =========================================================================
    // Contract: recent suggestions
    // =========================================================================

    describe("recent suggestions", () => {
        it("returns recent products for an empty query", async () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");
            store.recordScan("B");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const result =
                await getSmartSuggestions.value("");

            expect(
                result.map(
                    (item) => item.item_code,
                ),
            ).toEqual([
                "B",
                "A",
            ]);
        });

        it("treats whitespace-only query as empty", async () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const result =
                await getSmartSuggestions.value(
                    "   ",
                );

            expect(
                result.map(
                    (item) => item.item_code,
                ),
            ).toEqual(["A"]);
        });

        it("does not invoke search for an empty query", async () => {
            const store =
                useSmartSuggestionsStore();

            const {
                getSmartSuggestions,
            } = refsOf(store);

            await getSmartSuggestions.value("");

            expect(
                itemStoreMock.searchItems,
            ).not.toHaveBeenCalled();
        });

        it("resolves recent codes through the item store", async () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");
            store.recordScan("B");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            await getSmartSuggestions.value("");

            expect(
                itemStoreMock.getItem,
            ).toHaveBeenCalledTimes(2);

            expect(
                itemStoreMock.getItem,
            ).toHaveBeenNthCalledWith(
                1,
                "B",
            );

            expect(
                itemStoreMock.getItem,
            ).toHaveBeenNthCalledWith(
                2,
                "A",
            );
        });

        it("removes stale products that cannot be resolved", async () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("UNKNOWN");
            store.recordScan("A");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const result =
                await getSmartSuggestions.value("");

            expect(
                result.map(
                    (item) => item.item_code,
                ),
            ).toEqual(["A"]);
        });

        it("handles an empty recent history", async () => {
            const store =
                useSmartSuggestionsStore();

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const result =
                await getSmartSuggestions.value("");

            expect(result).toEqual([]);
        });
    });

    // =========================================================================
    // Contract: search
    // =========================================================================

    describe("search suggestions", () => {
        it("delegates non-empty queries to item search", async () => {
            const store =
                useSmartSuggestionsStore();

            const {
                getSmartSuggestions,
            } = refsOf(store);

            await getSmartSuggestions.value(
                "alpha",
            );

            expect(
                itemStoreMock.searchItems,
            ).toHaveBeenCalledTimes(1);

            expect(
                itemStoreMock.searchItems,
            ).toHaveBeenCalledWith(
                "alpha",
            );
        });

        it("normalizes query whitespace before searching", async () => {
            const store =
                useSmartSuggestionsStore();

            const {
                getSmartSuggestions,
            } = refsOf(store);

            await getSmartSuggestions.value(
                "  alpha  ",
            );

            expect(
                itemStoreMock.searchItems,
            ).toHaveBeenCalledWith(
                "alpha",
            );
        });

        it("returns search results without requiring scan history", async () => {
            const store =
                useSmartSuggestionsStore();

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const result =
                await getSmartSuggestions.value(
                    "alpha",
                );

            expect(
                result.map(
                    (item) => item.item_code,
                ),
            ).toEqual([
                "A",
                "B",
                "C",
            ]);
        });
    });

    // =========================================================================
    // Contract: ranking
    // =========================================================================

    describe("ranking", () => {
        it("boosts frequently scanned products", async () => {
            itemStoreMock.searchItems.mockResolvedValue(
                [
                    createItem("A", "Alpha"),
                    createItem("B", "Beta"),
                ],
            );

            const store =
                useSmartSuggestionsStore();

            store.recordScan("B");
            store.recordScan("B");
            store.recordScan("B");
            store.recordScan("A");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const result =
                await getSmartSuggestions.value(
                    "a",
                );

            expect(
                result[0].item_code,
            ).toBe("B");
        });

        it("keeps ranking deterministic for equal frequencies", async () => {
            itemStoreMock.searchItems.mockResolvedValue(
                [
                    createItem("A"),
                    createItem("B"),
                ],
            );

            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");
            store.recordScan("B");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const first =
                await getSmartSuggestions.value(
                    "item",
                );

            const second =
                await getSmartSuggestions.value(
                    "item",
                );

            expect(first).toEqual(second);
        });

        it("does not mutate source search results while ranking", async () => {
            const source = [
                createItem("A"),
                createItem("B"),
            ];

            const original =
                structuredClone(source);

            itemStoreMock.searchItems.mockResolvedValue(
                source,
            );

            const store =
                useSmartSuggestionsStore();

            store.recordScan("B");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            await getSmartSuggestions.value(
                "item",
            );

            expect(source).toEqual(original);
        });

        it("does not leak internal ranking metadata", async () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("B");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            const result =
                await getSmartSuggestions.value(
                    "item",
                );

            for (const item of result) {
                expect(item).not.toHaveProperty(
                    "_boostScore",
                );

                expect(item).not.toHaveProperty(
                    "_score",
                );

                expect(item).not.toHaveProperty(
                    "_frequency",
                );
            }
        });
    });

    // =========================================================================
    // Contract: resilience
    // =========================================================================

    describe("resilience", () => {
        it("does not fail when a recent item cannot be resolved", async () => {
            itemStoreMock.getItem.mockRejectedValue(
                new Error("offline"),
            );

            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");

            const {
                getSmartSuggestions,
            } = refsOf(store);

            await expect(
                getSmartSuggestions.value(""),
            ).resolves.toEqual([]);
        });

        it("does not fail when search is unavailable", async () => {
            itemStoreMock.searchItems.mockRejectedValue(
                new Error("network unavailable"),
            );

            const store =
                useSmartSuggestionsStore();

            const {
                getSmartSuggestions,
            } = refsOf(store);

            await expect(
                getSmartSuggestions.value(
                    "alpha",
                ),
            ).resolves.toEqual([]);
        });

        it("does not mutate scan state when search fails", async () => {
            itemStoreMock.searchItems.mockRejectedValue(
                new Error("offline"),
            );

            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");

            const {
                recentScans,
                scanFrequency,
                getSmartSuggestions,
            } = refsOf(store);

            await getSmartSuggestions.value(
                "alpha",
            );

            expect(
                recentScans.value,
            ).toEqual(["A"]);

            expect(
                scanFrequency.value,
            ).toEqual({
                A: 1,
            });
        });
    });

    // =========================================================================
    // Contract: clear
    // =========================================================================

    describe("clear", () => {
        it("clears recent history", () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");
            store.recordScan("B");

            store.clear();

            const {
                recentScans,
            } = refsOf(store);

            expect(
                recentScans.value,
            ).toEqual([]);
        });

        it("clears frequency data", () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");
            store.recordScan("B");

            store.clear();

            const {
                scanFrequency,
            } = refsOf(store);

            expect(
                scanFrequency.value,
            ).toEqual({});
        });

        it("allows tracking to continue after clear", () => {
            const store =
                useSmartSuggestionsStore();

            store.recordScan("A");
            store.clear();
            store.recordScan("B");

            const {
                recentScans,
                scanFrequency,
            } = refsOf(store);

            expect(
                recentScans.value,
            ).toEqual(["B"]);

            expect(
                scanFrequency.value,
            ).toEqual({
                B: 1,
            });
        });
    });

    // =========================================================================
    // Contract: Pinia isolation
    // =========================================================================

    describe("store isolation", () => {
        it("does not leak state between Pinia instances", () => {
            const firstStore =
                useSmartSuggestionsStore();

            firstStore.recordScan("A");

            setActivePinia(createPinia());

            const secondStore =
                useSmartSuggestionsStore();

            const {
                recentScans,
                scanFrequency,
            } = refsOf(secondStore);

            expect(
                recentScans.value,
            ).toEqual([]);

            expect(
                scanFrequency.value,
            ).toEqual({});
        });
    });
});

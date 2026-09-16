/**
 * اختبارات بدائل الشبكة — صموم الأوفلاين في نقاط البيع.
 * withTimeout، تصنيف الأخطاء، retryAsync بتراجع أُسّي.
 */
import { describe, expect, it, vi } from "vitest";

import {
	backoffDelay,
	extractStatus,
	isNetworkError,
	isRetryable,
	retryAsync,
	withTimeout,
} from "../src/utils/network.js";

describe("backoffDelay — التراجع الأُسّي", () => {
	it("بدون jitter القيمة حتمية وتنمو أُسّيًا", () => {
		expect(backoffDelay(0, { jitter: 0 })).toBe(300);
		expect(backoffDelay(1, { jitter: 0 })).toBe(600);
		expect(backoffDelay(2, { jitter: 0 })).toBe(1200);
	});

	it("يُسقَّف عند الحد الأقصى", () => {
		expect(backoffDelay(30, { jitter: 0 })).toBe(8000);
	});

	it("يطبّق jitter ضمن الحدود ويرجع قيمًا غير سالبة", () => {
		for (let i = 0; i < 50; i++) {
			const d = backoffDelay(1, { base: 300, factor: 2, jitter: 0.5 });
			expect(d).toBeGreaterThanOrEqual(150);
			expect(d).toBeLessThanOrEqual(1050);
		}
	});

	it("يتعامل مع attempt السالب كصفر", () => {
		expect(backoffDelay(-5, { jitter: 0 })).toBe(300);
	});
});

describe("withTimeout — سباق ضد الزمن", () => {
	it("يرجع القيمة عند الإنجاز قبل المهلة", async () => {
		await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
	});

	it("يرفض بخطأ TimeoutError عند تجاوز المهلة", async () => {
		const slow = new Promise((resolve) => setTimeout(resolve, 200));
		await expect(withTimeout(slow, 20, "sync-test")).rejects.toMatchObject({
			name: "TimeoutError",
		});
	});

	it("يتجاوز مهلة صفرية أو سالبة (لا مهلة)", async () => {
		await expect(withTimeout(Promise.resolve("ok"), 0)).resolves.toBe("ok");
	});
});

describe("extractStatus — استخراج رمز الحالة من أشكال متعددة", () => {
	it("يقرأ status وstatusCode وhttpStatus وresponse.status", () => {
		expect(extractStatus({ status: 500 })).toBe(500);
		expect(extractStatus({ statusCode: 429 })).toBe(429);
		expect(extractStatus({ httpStatus: 408 })).toBe(408);
		expect(extractStatus({ response: { status: 502 } })).toBe(502);
		expect(extractStatus({})).toBeNull();
		expect(extractStatus(null)).toBeNull();
	});
});

describe("isNetworkError / isRetryable — تصنيف الأخطاء", () => {
	it("TimeoutError قابلة للإعادة، وAbortError لا تُعاد أبدًا", () => {
		const timeout = Object.assign(new Error("x"), { name: "TimeoutError" });
		const abort = Object.assign(new Error("x"), { name: "AbortError" });
		expect(isNetworkError(timeout)).toBe(true);
		expect(isNetworkError(abort)).toBe(false);
		expect(isRetryable(abort)).toBe(false);
	});

	it("TypeError (فشل fetch) تُعد شبكية", () => {
		expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
	});

	it("رسائل الشبكة المعروفة تُصنَّف", () => {
		expect(isNetworkError(new Error("NetworkError when attempting to fetch"))).toBe(true);
		expect(isNetworkError(new Error("socket hang up"))).toBe(true);
	});

	it("أخطاء العمل غير قابلة للإعادة", () => {
		expect(isRetryable(new Error("Validation: customer required"))).toBe(false);
	});

	it("الحالات القابلة للإعادة معروفة", () => {
		expect(isRetryable({ status: 500 })).toBe(true);
		expect(isRetryable({ status: 429 })).toBe(true);
		expect(isRetryable({ status: 503 })).toBe(true);
		expect(isRetryable({ status: 400 })).toBe(false);
		expect(isRetryable({ status: 403 })).toBe(false);
	});
});

describe("retryAsync — إعادة المحاولة بذكاء", () => {
	it("ينجح من أول محاولة دون إعادة", async () => {
		const fn = vi.fn().mockResolvedValue("ok");
		await expect(retryAsync(fn, { baseDelay: 1 })).resolves.toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("يعيد المحاولة على خطأ شبكي ثم ينجح", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValue("synced");
		const onRetry = vi.fn();
		await expect(retryAsync(fn, { baseDelay: 1, onRetry })).resolves.toBe("synced");
		expect(fn).toHaveBeenCalledTimes(3);
		expect(onRetry).toHaveBeenCalledTimes(2);
	});

	it("لا يعيد المحاولة على أخطاء العمل (400)", async () => {
		const fn = vi.fn().mockRejectedValue({ status: 400, message: "bad request" });
		await expect(retryAsync(fn, { baseDelay: 1 })).rejects.toMatchObject({ status: 400 });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("يحترم حد المحاولات ثم يرمي آخر خطأ", async () => {
		const fn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
		await expect(retryAsync(fn, { retries: 2, baseDelay: 1 })).rejects.toBeInstanceOf(TypeError);
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("يحترم shouldRetry المخصص", async () => {
		const fn = vi.fn().mockRejectedValue({ status: 500 });
		await expect(
			retryAsync(fn, { retries: 5, baseDelay: 1, shouldRetry: () => false })
		).rejects.toMatchObject({ status: 500 });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("يمرّر رقم المحاولة للدالة", async () => {
		const attempts = [];
		const fn = vi.fn((attempt) => {
			attempts.push(attempt);
			return attempt < 2 ? Promise.reject(new TypeError("fetch failed")) : Promise.resolve(attempt);
		});
		await expect(retryAsync(fn, { baseDelay: 1 })).resolves.toBe(2);
		expect(attempts).toEqual([0, 1, 2]);
	});
});

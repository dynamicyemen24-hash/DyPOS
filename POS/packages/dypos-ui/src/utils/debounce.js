/**
 * Trailing-edge debounce that PRESERVES the argument list and always returns a
 * Promise, so it can wrap a resource fetcher directly (`createResource({ debounce })`).
 *
 * @param {Function} fn
 * @param {number} [wait] milliseconds
 * @returns {Function} debounced, with `.cancel()`
 */
export function debounce(fn, wait = 300) {
	/** @type {ReturnType<typeof setTimeout>|null} */
	let timer = null
	let pending = null

	function debounced(...args) {
		return new Promise((resolve, reject) => {
			if (timer) clearTimeout(timer)
			pending = { args, resolve, reject }
			timer = setTimeout(() => {
				timer = null
				const job = pending
				pending = null
				if (!job) return
				try {
					Promise.resolve(fn.apply(this, job.args)).then(
						job.resolve,
						job.reject,
					)
				} catch (error) {
					job.reject(error)
				}
			}, wait)
		})
	}

	debounced.cancel = () => {
		if (timer) clearTimeout(timer)
		timer = null
		pending = null
	}

	return debounced
}

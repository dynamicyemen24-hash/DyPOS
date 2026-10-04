import router from "@/router"
import { computed, reactive } from "vue"

const getCookie = (key) => {
	if (typeof document === "undefined") return null
	const cookies = new Map(
		document.cookie
			.split("; ")
			.filter(Boolean)
			.map((c) => c.split("=").map(decodeURIComponent)),
	)
	return cookies.get(key) || null
}

export const userData = reactive({
	userId: null,
	fullName: null,
	userImage: null,

	refresh() {
		const userId = getCookie("user_id")
		const fullName = getCookie("full_name")
		const userImage = getCookie("user_image")

		// Only update if we have valid data (not Guest)
		if (userId && userId !== "Guest") {
			this.userId = userId
			this.fullName = fullName
			this.userImage = userImage
		}
	},

	getDisplayName() {
		return this.fullName || this.userId || "User"
	},

	getImageUrl() {
		return this.userImage || null
	},

	getInitials() {
		const parts = this.getDisplayName().split(" ").filter(Boolean)
		return parts.length >= 2
			? (parts[0][0] + parts[1][0]).toUpperCase()
			: this.getDisplayName().substring(0, 2).toUpperCase()
	},
})

// Initial refresh
userData.refresh()

export const useUserData = () => ({
	userName: computed(() => userData.getDisplayName()),
	userImage: computed(() => userData.getImageUrl()),
	userInitials: computed(() => userData.getInitials()),
	userId: computed(() => userData.userId),
	refresh: () => userData.refresh(),
})

// Local-only user resource (offline-first).
// Never hits the network: identity comes from the local session store +
// login cookies. Any auth redirect is decided by the router guard, not here.
export const userResource = {
	loading: false,
	promise: null,
	data: null,
	async fetch() {
		userData.refresh()
		return userData
	},
	async reload() {
		userData.refresh()
		return userData
	},
	reset() {
		// Local identity is cleared by cleanupUserSession(), not here.
	},
}

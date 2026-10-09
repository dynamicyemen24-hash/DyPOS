<script>
/**
 * DyPOS FeatherIcon — inline SVG icon, zero network cost.
 *
 * Icons are inlined (not sprite-hashed, not fetched) so they work with the
 * service worker precache and render instantly offline.
 *
 * Props mirror the historical contract (`name`, `color`, `strokeWidth`) so the
 * 280+ call sites keep working. Unknown names resolve through a small alias
 * table (Lucide-style names that shipped in older screens) and finally fall
 * back to a neutral circle instead of rendering nothing.
 */
import { computed, h, mergeProps } from "vue"
import feather from "feather-icons"

export const FEATHER_ALIASES = {
	"loader-circle": "loader",
	"check-circle-2": "check-circle",
	"alert-circle": "alert-circle",
	"more-vertical": "more-horizontal",
	"external-link": "external-link",
	"corner-up-right": "corner-up-right",
	"work-filters-slide": "sliders",
	"bar-chart-2": "bar-chart-2",
	"trending-up": "trending-up",
}

export default {
	name: "FeatherIcon",
	inheritAttrs: false,
	props: {
		/** Feather icon name, e.g. "search", "trash-2", "wifi-off". */
		name: { type: String, required: true },
		/** Explicit colour (defaults to currentColor via CSS). */
		color: { type: String, default: null },
		/** Stroke width; 1.5 keeps the Feather optical balance at small sizes. */
		strokeWidth: { type: Number, default: 1.5 },
	},
	setup(props, { attrs }) {
		const icon = computed(() => {
			const direct = feather.icons[props.name]
			if (direct) return direct
			const aliased = FEATHER_ALIASES[props.name]
			if (aliased && feather.icons[aliased]) return feather.icons[aliased]
			return feather.icons.circle
		})

		return () =>
			h(
				"svg",
				mergeProps(
					icon.value.attrs,
					{
						fill: "none",
						stroke: "currentColor",
						color: props.color || undefined,
						"stroke-linecap": "round",
						"stroke-linejoin": "round",
						"stroke-width": props.strokeWidth,
						// Size belongs to the caller (a `w-5 h-5` utility, or a rule
						// like `.dy-login__input-icon`). The width/height attributes
						// are dropped so nothing here competes with that, and
						// `.dy-icon` in the base layer supplies the floor. Without
						// the floor the replaced-element default of `width: 100%`
						// stretched every icon to fill its container: the login page
						// drew a 382px envelope straight across the email and
						// password fields, over the top of the form.
						class: [icon.value.attrs.class, "shrink-0 dy-icon"],
						innerHTML: icon.value.contents,
					},
					attrs,
				),
			)
	},
}
</script>

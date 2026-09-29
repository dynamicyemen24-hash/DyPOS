import { computed } from "vue"

/**
 * Derive the column partitions shared by the grid, filters, and empty state.
 * Keeping this out of the view component prevents the frozen-column contract
 * from drifting as the grid grows.
 */
export function useWorkDataGridColumns(props) {
	const frozenLeftColumns = computed(() =>
		props.columns.filter((column) => column.frozen === "left"),
	)
	const frozenRightColumns = computed(() =>
		props.columns.filter((column) => column.frozen === "right"),
	)
	const mainColumns = computed(() =>
		props.columns.filter((column) => !column.frozen),
	)
	const allColumns = computed(() => [
		...frozenLeftColumns.value,
		...mainColumns.value,
		...frozenRightColumns.value,
	])
	const visibleColumns = allColumns
	const totalColumns = computed(
		() => allColumns.value.length + (props.selectable ? 1 : 0),
	)
	const frozenLeftWidth = computed(() =>
		frozenLeftColumns.value.reduce(
			(sum, column) => sum + (column.width || 150),
			0,
		),
	)
	const frozenRightWidth = computed(() =>
		frozenRightColumns.value.reduce(
			(sum, column) => sum + (column.width || 150),
			0,
		),
	)

	function columnStyle(column) {
		return {
			width: column.width ? `${column.width}px` : undefined,
			minWidth: column.minWidth ? `${column.minWidth}px` : undefined,
			maxWidth: column.maxWidth ? `${column.maxWidth}px` : undefined,
		}
	}

	return {
		frozenLeftColumns,
		frozenRightColumns,
		mainColumns,
		allColumns,
		visibleColumns,
		totalColumns,
		frozenLeftWidth,
		frozenRightWidth,
		columnStyle,
	}
}

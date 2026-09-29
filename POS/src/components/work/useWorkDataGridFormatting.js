import { formatCurrencySafe } from "@/utils/currency"

export function getCellValue(row, column) {
	if (typeof column?.compute === "function") return column.compute(row)
	return row?.[column?.key]
}

const numberFormatter = new Intl.NumberFormat("ar-SA")
const percentFormatter = new Intl.NumberFormat("ar-SA", { style: "percent" })
const dateFormatter = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" })

export function formatCell(row, column) {
	const value = getCellValue(row, column)
	if (value == null) return "—"
	switch (column?.format) {
		case "currency":
			return formatCurrencySafe(value)
		case "number":
			return numberFormatter.format(Number(value))
		case "percent":
			return percentFormatter.format(Number(value) / 100)
		case "date":
			return dateFormatter.format(new Date(value))
		default:
			return String(value)
	}
}

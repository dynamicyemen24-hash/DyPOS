function nonNegativeNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

export function buildReorderPlan(products, warehouse) {
	return products
		.map((product) => {
			const onHand = Number(product.stock_qty);
			const reserved = nonNegativeNumber(product.reserved_qty);
			const reorderPoint = nonNegativeNumber(product.reorder_point);
			const currentQty = Number.isFinite(onHand) ? onHand : 0;
			const availableQty = Math.max(0, currentQty - reserved);
			const suggestedQty = Math.max(0, reorderPoint - availableQty);
			const unitCost = nonNegativeNumber(product.cost);
			const status =
				reorderPoint <= 0
					? "unconfigured"
					: availableQty <= 0
						? "below_reorder"
						: availableQty <= reorderPoint
							? "suggested"
							: "ok";

			return {
				id: product.id,
				code: product.code,
				name: product.name_ar || product.name || product.code,
				category: product.category || "",
				warehouse,
				current_qty: currentQty,
				reserved_qty: reserved,
				available_qty: availableQty,
				reorder_point: reorderPoint,
				suggested_qty: suggestedQty,
				unit_cost: unitCost,
				stock_value: currentQty * unitCost,
				status,
			};
		})
		.sort((a, b) => {
			const priority = {
				below_reorder: 0,
				suggested: 1,
				unconfigured: 2,
				ok: 3,
			};
			return (
				priority[a.status] - priority[b.status] ||
				a.available_qty - b.available_qty
			);
		});
}

export function summarizeReorderPlan(items) {
	const actionable = items.filter(
		(item) => item.status === "below_reorder" || item.status === "suggested",
	);
	return {
		belowReorder: items.filter((item) => item.status === "below_reorder")
			.length,
		suggested: actionable.length,
		reorderValue: actionable.reduce(
			(total, item) => total + item.suggested_qty * item.unit_cost,
			0,
		),
	};
}

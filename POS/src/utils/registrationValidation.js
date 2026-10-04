export function emailValidationError(email) {
	if (!email) return ""
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
		? ""
		: "البريد الإلكتروني غير صالح"
}

export function confirmPasswordError(password, confirmation) {
	if (!confirmation || confirmation === password) return ""
	return "كلمتا المرور غير متطابقتين"
}

export function fullNameValidationError(fullName) {
	const normalizedName = fullName.trim()
	if (!normalizedName || normalizedName.length >= 2) return ""
	return "الاسم يجب أن يكون حرفين على الأقل"
}

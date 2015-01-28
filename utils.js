Util = {}

Util.renderAmount = function(amount, separator) {
	separator = separator || "."
    return String(amount).slice(0, -2) + separator + String(amount).slice(-2)
}

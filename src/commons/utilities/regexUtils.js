// Escape a user-supplied string so it can be used safely as a literal inside a
// MongoDB $regex without regex injection or catastrophic backtracking.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { escapeRegex };

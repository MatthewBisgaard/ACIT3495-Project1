// Input validation kept dependency-free on purpose: the rules are small.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const ROLES = new Set(['uploader', 'viewer']);

function validateCredentials(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['body must be a JSON object'];
  const { username, password } = body;
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    errors.push('username must be 3-32 chars: letters, digits, _ . -');
  }
  // 72 = bcrypt's input limit; anything longer is silently truncated by bcrypt
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    errors.push('password must be 8-72 characters');
  }
  return errors;
}

function validateRole(role) {
  return ROLES.has(role) ? [] : [`role must be one of: ${[...ROLES].join(', ')}`];
}

module.exports = { validateCredentials, validateRole, ROLES };

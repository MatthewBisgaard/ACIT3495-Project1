// Usage (password is read from stdin so it never appears in shell history or `ps`):
//   printf '%s\n' 'MyPassw0rd!' | docker compose exec -T auth node src/cli/create-user.js alice uploader
const bcrypt = require('bcryptjs');
const { load } = require('../config');
const { createUserRepo } = require('../db');
const { validateCredentials, validateRole } = require('../validate');

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.split('\n')[0];
}

(async () => {
  const [username, role = 'viewer'] = process.argv.slice(2);
  const password = await readStdin();
  const errors = [...validateCredentials({ username, password }), ...validateRole(role)];
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(2);
  }
  const repo = createUserRepo(load().db);
  try {
    const id = await repo.create({ username, passwordHash: await bcrypt.hash(password, 12), role });
    console.log(`created user ${username} (id=${id}, role=${role})`);
  } catch (err) {
    console.error(err.code === 'ER_DUP_ENTRY' ? 'username already exists' : err.message);
    process.exitCode = 1;
  } finally {
    await repo.close();
  }
})();

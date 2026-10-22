require('dotenv').config();
const { Client } = require('pg');

const EXPECTED_DATABASE = 'edusearch_ai';

function databaseNameFromUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    console.error('Refusing migration: DATABASE_URL is not a valid PostgreSQL URL.');
    process.exit(1);
  }

  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!name || name.includes('/')) {
    console.error('Refusing migration: DATABASE_URL does not contain a database name.');
    process.exit(1);
  }

  return name;
}

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('Refusing migration: DATABASE_URL is missing.');
    process.exit(1);
  }

  const configuredName = databaseNameFromUrl(raw);
  if (configuredName !== EXPECTED_DATABASE) {
    console.error(`Refusing migration: configured database is not ${EXPECTED_DATABASE}.`);
    process.exit(1);
  }

  const client = new Client({
    connectionString: raw,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const result = await client.query('SELECT current_database() AS name');
    const actualName = result.rows[0].name;
    if (actualName !== EXPECTED_DATABASE) {
      console.error(`Refusing migration: connected database is not ${EXPECTED_DATABASE}.`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`Database target confirmed: ${EXPECTED_DATABASE}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown database error';
  console.error(
    `Refusing migration: ${message.replace(/postgres(ql)?:\/\/\S+/gi, '[redacted]')}`,
  );
  process.exit(1);
});

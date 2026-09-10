#!/usr/bin/env node
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found.');
    process.exit(0);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    process.exit(0);
  }

  // Create migrations tracking table
  await pool.query(`
    create table if not exists public._migrations (
      id serial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    );
  `);

  for (const file of files) {
    const { rows } = await pool.query(
      'select 1 from public._migrations where filename = $1',
      [file]
    );
    if (rows.length > 0) {
      console.log(`⏭️  Skipped (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`▶️  Applying: ${file}`);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'insert into public._migrations (filename) values ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`✅ Applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Failed: ${file}`);
      console.error(err.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log('\n🎉 All migrations applied successfully.');
  await pool.end();
}

runMigrations().catch(err => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});

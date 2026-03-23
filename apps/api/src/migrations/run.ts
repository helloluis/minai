import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../../../.env.local') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    const migrations = [
      '001_initial.sql',
      '002_user_memory_unique.sql',
      '003_message_images.sql',
      '004_message_feedback.sql',
      '005_notebooks_notes.sql',
      '006_google_auth.sql',
      '007_notebook_calendars.sql',
      '008_deposit_addresses.sql',
      '009_free_credit.sql',
      '010_feature_suggestions.sql',
      '011_message_widgets.sql',
      '012_payment_sender.sql',
      '013_user_timezone_briefing.sql',
      '014_notebook_files.sql',
      '015_message_files.sql',
      '017_balance_high_water.sql',
      '018_file_llm_summary.sql',
      '019_file_summary_cost.sql',
      '020_user_memory_text.sql',
      '021_message_tool_cost.sql',
      '022_user_wallet_address.sql',
      '023_shared_posts.sql',
      '024_coupon_codes.sql',
    ];

    for (const migration of migrations) {
      const { rows } = await client.query(
        'SELECT 1 FROM _migrations WHERE name = $1',
        [migration]
      );

      if (rows.length === 0) {
        console.log(`Applying migration: ${migration}`);
        const sql = readFileSync(join(__dirname, migration), 'utf-8');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [migration]
        );
        console.log(`Applied: ${migration}`);
      } else {
        console.log(`Already applied: ${migration}`);
      }
    }

    console.log('All migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

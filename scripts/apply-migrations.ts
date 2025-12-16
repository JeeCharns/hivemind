/**
 * Migration Application Script
 *
 * Applies SQL migrations to the Supabase database
 * Usage: npm run migrate or tsx scripts/apply-migrations.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   - NEXT_PUBLIC_SUPABASE_URL");
  console.error("   - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration(filename: string) {
  console.log(`\n📝 Applying migration: ${filename}`);

  try {
    const migrationPath = join(process.cwd(), "supabase", "migrations", filename);
    const sql = readFileSync(migrationPath, "utf-8");

    // Split by semicolons but preserve them in statements
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"))
      .map(s => s + ";");

    for (const statement of statements) {
      if (statement.trim().length <= 1) continue;

      const { error } = await supabase.rpc("exec_sql", { sql_query: statement });

      if (error) {
        console.error(`❌ Error executing statement:`, error);
        console.error(`Statement was:`, statement.substring(0, 100) + "...");
        throw error;
      }
    }

    console.log(`✅ Successfully applied: ${filename}`);
  } catch (error) {
    console.error(`❌ Failed to apply migration: ${filename}`, error);
    throw error;
  }
}

async function main() {
  console.log("🚀 Starting migration process...");

  const migrations = [
    "001_create_hive_invites.sql",
  ];

  for (const migration of migrations) {
    await applyMigration(migration);
  }

  console.log("\n✨ All migrations applied successfully!");
}

main().catch((error) => {
  console.error("💥 Migration process failed:", error);
  process.exit(1);
});

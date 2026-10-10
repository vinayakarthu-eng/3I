import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: "../../.env" });

async function main() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://drillforce:drillforce@localhost:5432/drillforce";
  const sql = postgres(url, { max: 1 });
  console.log("⏳ Running migrations…");
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("✅ Migrations complete");
  await sql.end();
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

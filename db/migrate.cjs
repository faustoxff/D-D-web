#!/usr/bin/env node
// Applies db/migrations/*.sql in order, once each. Usage: npm run db:migrate
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require(require.resolve("pg", { paths: [path.join(__dirname, "../server")] }));
require(require.resolve("dotenv", { paths: [path.join(__dirname, "../server")] })).config({
  path: path.join(__dirname, "../server/.env"),
});

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (server/.env)");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
  const dir = path.join(__dirname, "migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations(name) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file} failed: ${err.message}`);
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

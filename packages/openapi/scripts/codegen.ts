// This script is executed directly by Jiti and does not produce package code.
// @ts-nocheck
import { readFile, writeFile } from "node:fs/promises";

// MyAnimeList embeds the OpenAPI document in its Redoc page.
const SOURCE_URL = "https://myanimelist.net/apiconfig/references/api/v2";
const SCHEMA_PATH = new URL("../openapi.json", import.meta.url);
const METADATA_PATH = new URL("../openapi.meta.json", import.meta.url);
const REDOC_MARKER = "const __redoc_state = ";

function findJsonEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  // Count braces while ignoring braces inside JSON strings.
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return index + 1;
  }

  throw new Error("Embedded JSON was not terminated.");
}

function extractSchema(html) {
  const markerStart = html.indexOf(REDOC_MARKER);
  if (markerStart === -1) throw new Error("Redoc state was not found.");

  const jsonStart = markerStart + REDOC_MARKER.length;
  const jsonEnd = findJsonEnd(html, jsonStart);
  const state = JSON.parse(html.slice(jsonStart, jsonEnd));
  if (!state.spec?.data) throw new Error("OpenAPI schema was not found.");

  return state.spec.data;
}

async function fetchSchema() {
  const response = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "myanimelist-openapi-extractor/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  return extractSchema(await response.text());
}

function createMetadata(schema) {
  const info = schema.info ?? {};
  return {
    sourceUrl: SOURCE_URL,
    extractedAt: new Date().toISOString(),
    openapiVersion: schema.openapi ?? schema.swagger ?? "unknown",
    title: info.title ?? "unknown",
    infoVersion: info.version ?? "unknown",
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function hasSchemaChanged(schema) {
  try {
    const currentSchema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
    return JSON.stringify(currentSchema) !== JSON.stringify(schema);
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

const schema = await fetchSchema();

if (!(await hasSchemaChanged(schema))) {
  console.log("Schema is unchanged; skipping generated files.");
  process.exit(0);
}

const metadata = createMetadata(schema);
await writeJson(SCHEMA_PATH, schema);
await writeJson(METADATA_PATH, metadata);

console.log(`Saved ${SCHEMA_PATH.pathname}`);

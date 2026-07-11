import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("packaging emits stable installer names used by the dashboard", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));

  assert.equal(packageJson.build.mac.artifactName, "SkinsCasa-macOS.${ext}");
  assert.equal(packageJson.build.win.artifactName, "SkinsCasa-Windows.${ext}");
  assert.ok(packageJson.build.files.includes("protocol.mjs"));
  assert.deepEqual(packageJson.build.protocols, [
    {
      name: "SkinsCasa",
      schemes: ["skinscasa"],
    },
  ]);
});

test("release workflow builds macOS and Windows installer assets", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  ).catch(() => "");

  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /gh release create/);
});

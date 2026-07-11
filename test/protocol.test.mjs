import assert from "node:assert/strict";
import test from "node:test";

import { findSkinsCasaProtocolUrl, isSkinsCasaProtocolUrl } from "../protocol.mjs";

test("accepts only the SkinsCasa open deeplink", () => {
  assert.equal(isSkinsCasaProtocolUrl("skinscasa://open"), true);
  assert.equal(isSkinsCasaProtocolUrl("skinscasa://open?source=dashboard"), true);
  assert.equal(isSkinsCasaProtocolUrl("skinscasa://open/unexpected"), false);
  assert.equal(isSkinsCasaProtocolUrl("https://skins.casa"), false);
  assert.equal(isSkinsCasaProtocolUrl("skinscasa://connect?token=secret"), false);
});

test("finds the first SkinsCasa deeplink in process arguments", () => {
  assert.equal(
    findSkinsCasaProtocolUrl(["SkinsCasa.exe", "--hidden", "skinscasa://open"]),
    "skinscasa://open",
  );
  assert.equal(findSkinsCasaProtocolUrl(["SkinsCasa.exe", "--hidden"]), null);
});

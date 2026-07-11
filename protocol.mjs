const PROTOCOL = "skinscasa:";

export function isSkinsCasaProtocolUrl(value) {
  try {
    const parsed = new URL(value);

    return parsed.protocol === PROTOCOL && parsed.hostname === "open";
  } catch {
    return false;
  }
}

export function findSkinsCasaProtocolUrl(argv) {
  return argv.find((value) => isSkinsCasaProtocolUrl(value)) ?? null;
}

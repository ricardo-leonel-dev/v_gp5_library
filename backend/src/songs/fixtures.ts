import { readFile } from "node:fs/promises";
import path from "node:path";

export const PRESET_FIXTURES = [
  { file: "02-TLDLXAMP.prst", name: "TL DLX AMP" },
  { file: "36-TLAC3CL1.prst", name: "TL AC3 CL1" },
  { file: "55-TLPLXSLO.prst", name: "TL PLX SLO" },
] as const;

export async function loadFixture(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(import.meta.dir, "fixtures", file)));
}

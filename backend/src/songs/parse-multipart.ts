import type { CreateSongInput, UploadedFile } from "./song-service";

export type FormValue = string | File | (string | File)[] | undefined;

async function toUploadedFiles(value: FormValue): Promise<UploadedFile[]> {
  const entries = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const files = entries.filter((e): e is File => e instanceof File);
  return Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      mimeType: f.type || "application/octet-stream",
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}

function toStringField(value: FormValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function parseCreateSongMultipart(
  body: Record<string, FormValue>,
): Promise<CreateSongInput> {
  return {
    name: toStringField(body.name),
    artist: toStringField(body.artist),
    extraConfig: toStringField(body.extra_config),
    preset: await toUploadedFiles(body.preset),
    ir: await toUploadedFiles(body.ir),
    nam: await toUploadedFiles(body.nam),
    cover: await toUploadedFiles(body.cover),
  };
}

// F21 R14, R15, R27: extracts only `preset` file parts from the body. A `preset`
// part sent as a plain string is not a preset part (filter `toUploadedFiles`
// already drops non-File values), so it counts as zero parts -> 400 in the route.
export async function parsePresetMultipart(
  body: Record<string, FormValue>,
): Promise<UploadedFile[]> {
  return toUploadedFiles(body.preset);
}

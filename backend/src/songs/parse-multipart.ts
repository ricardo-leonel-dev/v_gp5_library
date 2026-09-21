import type { CreateSongInput, UploadedFile } from "./song-service";

type FormValue = string | File | (string | File)[] | undefined;

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
    pedalPresetName: toStringField(body.pedal_preset_name),
    extraConfig: toStringField(body.extra_config),
    preset: await toUploadedFiles(body.preset),
    ir: await toUploadedFiles(body.ir),
    nam: await toUploadedFiles(body.nam),
    cover: await toUploadedFiles(body.cover),
  };
}

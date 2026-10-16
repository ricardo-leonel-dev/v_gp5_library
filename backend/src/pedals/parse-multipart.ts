import type { CreatePedalInput, UploadedFile } from "./pedal-service";

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

export async function parseCreatePedalMultipart(
  body: Record<string, FormValue>,
): Promise<CreatePedalInput> {
  return {
    name: toStringField(body.name),
    image: await toUploadedFiles(body.image),
  };
}

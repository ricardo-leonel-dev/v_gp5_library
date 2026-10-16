import { createStorageAdapter } from "../config/stage";
import type { StorageAdapter } from "./adapter";

let adapter: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  adapter ??= createStorageAdapter();
  return adapter;
}
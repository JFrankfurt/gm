import { stableStringify, type WorkspaceDoc, zWorkspaceDoc } from "@gm/shared";
import { gzipSync, gunzipSync } from "fflate";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded =
    s.replaceAll("-", "+").replaceAll("_", "/") +
    "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeDocToSnapshotPayloadSync(doc: WorkspaceDoc): string {
  const json = stableStringify({ ...doc, selection: [] });
  const input = new TextEncoder().encode(json);
  const compressed = gzipSync(input);
  return toBase64Url(compressed);
}

export function decodeDocFromSnapshotPayloadSync(
  payload: string
): WorkspaceDoc {
  const bytes = fromBase64Url(payload);
  const decompressed = gunzipSync(bytes);
  const json = new TextDecoder().decode(decompressed);
  return zWorkspaceDoc.parse(JSON.parse(json));
}

export async function encodeDocToSnapshotPayload(
  doc: WorkspaceDoc
): Promise<string> {
  return encodeDocToSnapshotPayloadSync(doc);
}

export async function decodeDocFromSnapshotPayload(
  payload: string
): Promise<WorkspaceDoc> {
  return decodeDocFromSnapshotPayloadSync(payload);
}

export function snapshotUrlFromPayload(payload: string): string {
  return `${location.origin}/s/${payload}`;
}

import { zWorkspaceDoc, type WorkspaceDoc } from "@gm/shared";
import { gunzipSync } from "node:zlib";

function fromBase64Url(s: string): Buffer {
  const padded =
    s.replaceAll("-", "+").replaceAll("_", "/") +
    "===".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function decodeWorkspaceDocFromSnapshotPayload(
  payload: string
): WorkspaceDoc {
  const gz = fromBase64Url(payload);
  const json = gunzipSync(gz).toString("utf8");
  return zWorkspaceDoc.parse(JSON.parse(json));
}

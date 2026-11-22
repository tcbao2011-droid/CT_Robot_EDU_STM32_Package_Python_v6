import { readBuildResponse } from "./compiler.js";

async function postNdjson(url, payload, onLog, { requireArtifact = false } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (_) {
    throw new Error("Không kết nối được máy chủ. Hãy chạy `npm run dev`.");
  }
  return readBuildResponse(response, onLog, { requireArtifact });
}

export async function uploadViaServer(code, onLog, port, profile) {
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("Chưa có mã Arduino để nạp.");
  }
  if (!profile?.fqbn) throw new Error("Chưa chọn board/FQBN hợp lệ.");

  await postNdjson("/api/upload", {
    code,
    port: port || null,
    fqbn: profile.fqbn,
    boardName: profile.name,
    profileId: profile.id,
  }, onLog, { requireArtifact: false });
}

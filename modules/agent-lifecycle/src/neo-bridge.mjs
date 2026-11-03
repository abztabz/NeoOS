// Thin adapter for the Neo Studio ChatGPT bridge. The host must inject the
// connector functions; this module does not possess credentials or Mac access.
export function unpackNeoResult(response) {
  if (response?.structuredContent && typeof response.structuredContent === "object") {
    return response.structuredContent;
  }
  if (response?.job_id || response?.status) return response;
  if (typeof response?.content === "string") {
    try { return JSON.parse(response.content); } catch { /* unsupported response */ }
  }
  const message = Array.isArray(response?.content)
    ? response.content.find(x => x?.type === "text" && typeof x.text === "string")
    : null;
  if (message) {
    try { return JSON.parse(message.text); } catch { /* unsupported response */ }
  }
  throw new Error("Unrecognized Neo bridge response; abort safely");
}

export class NeoBridgeTransport {
  constructor({ deviceId, assignAgent, getAgentTask, cancelJob }) {
    if (!deviceId || !assignAgent || !getAgentTask || !cancelJob) {
      throw new Error("Neo bridge device and three authorized tool functions required");
    }
    this.deviceId = deviceId;
    this.assignAgent = assignAgent;
    this.getAgentTask = getAgentTask;
    this.cancelJob = cancelJob;
  }

  async assign(payload) {
    const allowed = new Set(["youtube_learner", "subject_learner", "summarize", "rewrite", "extract_facts"]);
    if (!allowed.has(payload.agent_kind)) throw new Error("Unsupported Neo agent kind");
    if (payload.data_zone !== "general" || payload.export_to_chatgpt !== true) {
      throw new Error("Only authorized general-zone bridge jobs are allowed");
    }
    const response = unpackNeoResult(await this.assignAgent({ ...payload, device_id: this.deviceId }));
    if (!response.job_id) throw new Error("No Neo job ID");
    return response;
  }

  async read({ job_id, include_entry = true }) {
    return unpackNeoResult(await this.getAgentTask({ job_id, include_entry }));
  }

  async cancel({ job_id }) {
    return unpackNeoResult(await this.cancelJob({ job_id }));
  }
}

import type { BoundedTextBodyResult } from "../_shared/bounded-body.ts";
import {
  classifyOutboxProcessResult,
  outboxFailureMessage,
} from "./logic.ts";

type OutboxEvent = { id: string };
type OutboxRpcError = { code?: string; message?: unknown } | null;
type OutboxRpcResponse = { data: unknown; error: OutboxRpcError };

export type OutboxWorkerRpcClient = {
  rpc(procedure: string, parameters: Record<string, unknown>): Promise<OutboxRpcResponse>;
};

export type OutboxWorkerHandlerDependencies = {
  getEnv(name: string): string | undefined;
  readBody(request: Request): Promise<BoundedTextBodyResult>;
  createClient(url: string, serviceKey: string): OutboxWorkerRpcClient;
  createId(): string;
  logError(message: string, context: Record<string, unknown>): void;
};

type BatchSizeResult =
  | { ok: true; batchSize: number }
  | { ok: false; response: Response };

type EventOutcome = "processed" | "retry" | "dead_letter" | "failure";

type BatchSummary = {
  claimed: number;
  processed: number;
  retry_scheduled: number;
  dead_lettered: number;
  failures: number;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBatchSize(
  request: Request,
  readBody: OutboxWorkerHandlerDependencies["readBody"],
): Promise<BatchSizeResult> {
  const bodyRead = await readBody(request);
  if (!bodyRead.ok) {
    if (bodyRead.reason === "too_large") {
      return { ok: false, response: json({ error: "request_too_large" }, 413) };
    }
    const error = bodyRead.reason === "invalid_utf8" ? "invalid_json" : "invalid_request";
    return { ok: false, response: json({ error }, 400) };
  }

  let payload: unknown = {};
  if (bodyRead.text.trim()) {
    try {
      payload = JSON.parse(bodyRead.text) as unknown;
    } catch {
      return { ok: false, response: json({ error: "invalid_json" }, 400) };
    }
  }

  // Preserve the worker's existing empty/non-object body fallback to the default batch.
  const input = isRecord(payload) ? payload : {};
  const batchSize = input.batch_size === undefined ? 20 : input.batch_size;
  if (!Number.isInteger(batchSize) || Number(batchSize) < 1 || Number(batchSize) > 50) {
    return {
      ok: false,
      response: json({ error: "batch_size_must_be_between_1_and_50" }, 400),
    };
  }
  return { ok: true, batchSize: Number(batchSize) };
}

async function processClaimedEvent(
  client: OutboxWorkerRpcClient,
  workerId: string,
  event: OutboxEvent,
  logError: OutboxWorkerHandlerDependencies["logError"],
): Promise<EventOutcome> {
  const { data, error } = await client.rpc("process_outbox_event", {
    p_event_id: event.id,
    p_worker: workerId,
  });
  const outcome = error ? "unexpected" : classifyOutboxProcessResult(data);
  if (outcome !== "unexpected") return outcome;

  // A missing or unknown status is not success; persist a retry/dead-letter outcome.
  const { data: failureData, error: failureError } = await client.rpc("fail_outbox_event", {
    p_event_id: event.id,
    p_worker: workerId,
    p_error_class: error?.code ?? "unexpected_process_result",
    p_error_message: outboxFailureMessage(error),
  });
  if (failureError) {
    logError("outbox failure could not be persisted", {
      eventId: event.id,
      code: failureError.code ?? "unknown",
    });
    return "failure";
  }

  const failureOutcome = classifyOutboxProcessResult(failureData);
  if (failureOutcome === "unexpected") {
    logError("outbox failure recorder returned an unrecognized status", {
      eventId: event.id,
    });
    return "failure";
  }
  return failureOutcome;
}

async function processClaimedEvents(
  client: OutboxWorkerRpcClient,
  workerId: string,
  claimed: OutboxEvent[],
  logError: OutboxWorkerHandlerDependencies["logError"],
): Promise<BatchSummary> {
  const summary: BatchSummary = {
    claimed: claimed.length,
    processed: 0,
    retry_scheduled: 0,
    dead_lettered: 0,
    failures: 0,
  };

  // Keep sequential processing: event ordering and lease ownership remain unchanged.
  for (const event of claimed) {
    const outcome = await processClaimedEvent(client, workerId, event, logError);
    if (outcome === "processed") summary.processed += 1;
    else if (outcome === "retry") summary.retry_scheduled += 1;
    else if (outcome === "dead_letter") summary.dead_lettered += 1;
    else summary.failures += 1;
  }
  return summary;
}

export function createOutboxWorkerHandler(
  dependencies: OutboxWorkerHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const expectedSecret = dependencies.getEnv("OUTBOX_WORKER_SECRET");
    const suppliedSecret = request.headers.get("x-outbox-worker-secret") ?? "";
    if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
      return json({ error: "unauthorized" }, 401);
    }

    const url = dependencies.getEnv("SUPABASE_URL");
    const serviceKey = dependencies.getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return json({ error: "worker_not_configured" }, 503);
    }

    const batchResult = await readBatchSize(request, dependencies.readBody);
    if (!batchResult.ok) return batchResult.response;

    const workerId = "edge-outbox:" + dependencies.createId();
    const client = dependencies.createClient(url, serviceKey);
    const { data: claimedRows, error: claimError } = await client.rpc("claim_outbox_events", {
      p_worker: workerId,
      p_limit: batchResult.batchSize,
      p_lease_seconds: 300,
    });
    if (claimError) {
      dependencies.logError("outbox claim failed", {
        code: claimError.code ?? "unknown",
      });
      return json({ error: "claim_failed" }, 500);
    }

    const claimed = (claimedRows ?? []) as OutboxEvent[];
    const summary = await processClaimedEvents(
      client,
      workerId,
      claimed,
      dependencies.logError,
    );
    return json({
      worker_id: workerId,
      ...summary,
    });
  };
}

import { createClient } from "npm:@supabase/supabase-js@2";
import { readBoundedTextBody } from "../_shared/bounded-body.ts";
import {
  ASYNC_EXPORT_BUCKET, ASYNC_EXPORT_MAX_BYTES, ASYNC_EXPORT_MAX_ITEMS, ASYNC_EXPORT_MAX_ORDERS,
  buildOrdersCsv, sha256Hex, validateOrdersExportFilters,
  type AsyncOrderCsvRow, type OrdersExportFilters,
} from "../../../src/lib/async-export-csv.ts";

type Runtime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
type EdgeBackground = { waitUntil?: (promise: Promise<unknown>) => void };
type Job = {
  id: string; organization_id: string; requested_by: string; export_type: string;
  filters: unknown; attempt_count: number; lease_owner: string;
};
type Order = {
  id: string; organization_id: string; customer_id: string; order_number: string;
  status: string; created_at: string; total_amount: string | number; quantity_review_required: boolean;
};
type Customer = { id: string; organization_id: string; customer_code: string; business_name: string };
type Item = {
  id: string; order_id: string; item_code: string | null; product_name_snapshot: string;
  unit_snapshot: string | null; quantity: string | number; unit_price_snapshot: string | number;
  discount_snapshot: string | number; line_total: string | number;
};

const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("async export worker requires Supabase Edge Runtime.");
const bucket = ASYNC_EXPORT_BUCKET;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, x-client-info, content-type, x-async-export-worker-secret",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
function reply(value: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: CORS });
}
function constantTimeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function dateTimeBound(date: string, nextDay = false): string {
  const d = new Date(date + "T00:00:00.000Z");
  if (nextDay) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
function failCode(error: unknown): string {
  if (error && typeof error === "object" && "exportCode" in error) {
    const code = (error as { exportCode?: unknown }).exportCode;
    if (typeof code === "string") return code;
  }
  return "SOURCE_READ_FAILED";
}
function exportError(code: string): Error & { exportCode: string } {
  return Object.assign(new Error(code), { exportCode: code });
}

async function loadPaged<T>(
  pageFactory: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  maxRows: number,
  overflowCode: string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const end = Math.min(offset + pageSize - 1, maxRows);
    const { data, error } = await pageFactory(offset, end);
    if (error) throw exportError("SOURCE_READ_FAILED");
    const page = data ?? [];
    rows.push(...page);
    if (rows.length > maxRows) throw exportError(overflowCode);
    if (page.length < end - offset + 1) return rows;
  }
  if (rows.length > maxRows) throw exportError(overflowCode);
  return rows;
}

async function buildOrderRows(admin: ReturnType<typeof createClient>, job: Job): Promise<AsyncOrderCsvRow[]> {
  if (job.export_type !== "orders_csv") throw exportError("INVALID_JOB_FILTERS");
  let filters: OrdersExportFilters;
  try { filters = validateOrdersExportFilters(job.filters); } catch { throw exportError("INVALID_JOB_FILTERS"); }
  const start = dateTimeBound(filters.date_from);
  const end = dateTimeBound(filters.date_to, true);

  const orders = await loadPaged<Order>((from, to) => admin.from("orders")
    .select("id,organization_id,customer_id,order_number,status,created_at,total_amount,quantity_review_required")
    .eq("organization_id", job.organization_id)
    .in("status", ["confirmed", "processing", "shipped", "delivered"])
    .eq("quantity_review_required", false)
    .gte("created_at", start).lt("created_at", end)
    .order("created_at", { ascending: true }).order("id", { ascending: true })
    .range(from, to), ASYNC_EXPORT_MAX_ORDERS, "TOO_MANY_ORDERS");
  if (orders.length === 0) throw exportError("NO_APPROVED_ORDERS");

  const customerIds = [...new Set(orders.map((order) => order.customer_id))];
  const customerRows: Customer[] = [];
  for (let offset = 0; offset < customerIds.length; offset += 250) {
    const ids = customerIds.slice(offset, offset + 250);
    const { data, error } = await admin.from("customers")
      .select("id,organization_id,customer_code,business_name")
      .eq("organization_id", job.organization_id).in("id", ids);
    if (error) throw exportError("SOURCE_READ_FAILED");
    customerRows.push(...(data ?? []) as Customer[]);
  }
  const customers = new Map(customerRows.map((customer) => [customer.id, customer]));
  if (orders.some((order) => {
    const customer = customers.get(order.customer_id);
    return !customer || customer.organization_id !== job.organization_id;
  })) throw exportError("CUSTOMER_SCOPE_FAILED");

  const items: Item[] = [];
  for (let i = 0; i < orders.length; i += 100) {
    const ids = orders.slice(i, i + 100).map((order) => order.id);
    const chunk = await loadPaged<Item>((from, to) => admin.from("order_items")
      .select("id,order_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,discount_snapshot,line_total")
      .in("order_id", ids).order("order_id", { ascending: true }).order("id", { ascending: true })
      .range(from, to), ASYNC_EXPORT_MAX_ITEMS - items.length, "TOO_MANY_ITEMS");
    items.push(...chunk);
    if (items.length > ASYNC_EXPORT_MAX_ITEMS) throw exportError("TOO_MANY_ITEMS");
  }
  if (!items.length) throw exportError("NO_ORDER_ITEMS");
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  const rows: AsyncOrderCsvRow[] = [];
  for (const item of items) {
    const order = orderMap.get(item.order_id);
    if (!order) continue;
    const customer = customers.get(order.customer_id);
    if (!customer) throw exportError("CUSTOMER_SCOPE_FAILED");
    rows.push({
      orderNumber: order.order_number,
      createdAt: order.created_at,
      status: order.status,
      customerCode: customer.customer_code,
      customerName: customer.business_name,
      itemCode: item.item_code ?? "",
      itemName: item.product_name_snapshot,
      unit: item.unit_snapshot ?? "",
      quantity: item.quantity,
      unitPrice: item.unit_price_snapshot,
      discount: item.discount_snapshot,
      lineTotal: item.line_total,
      orderTotal: order.total_amount,
    });
  }
  return rows;
}

async function cleanExpired(admin: ReturnType<typeof createClient>): Promise<void> {
  const { data, error } = await admin.rpc("sweep_expired_async_export_jobs", { p_limit: 25 });
  if (error) {
    console.error("async export expiry sweep failed", { code: error.code ?? "unknown" });
    return;
  }
  for (const item of (data ?? []) as { job_id: string; object_path: string | null }[]) {
    if (!item.object_path) continue;
    const { error: removeError } = await admin.storage.from(bucket).remove([item.object_path]);
    if (removeError) {
      console.error("async export artifact cleanup failed", { job_id: item.job_id, code: removeError.name ?? "storage_error" });
      continue;
    }
    await admin.rpc("clear_expired_async_export_artifact", {
      p_job_id: item.job_id, p_object_path: item.object_path,
    });
  }
}

async function processJob(admin: ReturnType<typeof createClient>, job: Job): Promise<void> {
  const workerId = job.lease_owner;
  try {
    const rows = await buildOrderRows(admin, job);
    const csv = buildOrdersCsv(rows);
    const bytes = new TextEncoder().encode(csv);
    if (bytes.byteLength < 1 || bytes.byteLength > ASYNC_EXPORT_MAX_BYTES) {
      throw exportError("ARTIFACT_TOO_LARGE");
    }
    const objectPath = job.organization_id + "/" + job.id + "/orders.csv";
    const hash = await sha256Hex(bytes);
    const { error: uploadError } = await admin.storage.from(bucket).upload(objectPath, bytes, {
      contentType: "text/csv", upsert: true, cacheControl: "60",
    });
    if (uploadError) throw exportError("ARTIFACT_UPLOAD_FAILED");
    const { error: completeError } = await admin.rpc("complete_async_export_job", {
      p_job_id: job.id, p_worker: workerId, p_object_path: objectPath,
      p_file_name: "orders.csv", p_content_type: "text/csv",
      p_byte_size: bytes.byteLength, p_sha256: hash, p_row_count: rows.length,
    });
    if (completeError) throw exportError("ARTIFACT_BUILD_FAILED");
  } catch (error) {
    const code = failCode(error);
    const { error: failError } = await admin.rpc("fail_async_export_job", {
      p_job_id: job.id, p_worker: workerId, p_error_code: code,
    });
    if (failError) console.error("async export failure could not be recorded", { job_id: job.id, code: failError.code ?? "unknown" });
    console.error("async export job failed", { job_id: job.id, error_code: code });
  }
}

type WorkerMode =
  | { kind: "secret"; batchSize: number }
  | { kind: "user"; jobId: string };

type WorkerPayloadResult =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; response: Response };

type WorkerModeResult =
  | { ok: true; mode: WorkerMode }
  | { ok: false; response: Response };

type ClaimedJobsResult =
  | { ok: true; jobs: Job[] }
  | { ok: false; response: Response };

function requestBodyFailure(reason: "too_large" | "unreadable" | "invalid_utf8"): Response {
  const status = reason === "too_large" ? 413 : 400;
  const error = reason === "too_large"
    ? "request_too_large"
    : reason === "invalid_utf8" ? "invalid_json" : "invalid_request";
  return reply({ error }, status);
}

function parseWorkerPayload(bodyText: string): WorkerPayloadResult {
  if (!bodyText.trim()) return { ok: true, input: {} };

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch {
    return { ok: false, response: reply({ error: "invalid_json" }, 400) };
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, response: reply({ error: "invalid_request" }, 400) };
  }
  return { ok: true, input: payload as Record<string, unknown> };
}

function resolveWorkerMode(
  input: Record<string, unknown>,
  secretMode: boolean,
  token: string,
): WorkerModeResult {
  if (secretMode) {
    if (!token) return { ok: false, response: reply({ error: "unauthorized" }, 401) };
    if (Object.keys(input).some((key) => key !== "batch_size")) {
      return { ok: false, response: reply({ error: "invalid_request" }, 400) };
    }

    const batchSize = input.batch_size === undefined ? 1 : input.batch_size;
    if (!Number.isInteger(batchSize) || Number(batchSize) < 1 || Number(batchSize) > 5) {
      return { ok: false, response: reply({ error: "batch_size_must_be_between_1_and_5" }, 400) };
    }
    return { ok: true, mode: { kind: "secret", batchSize: Number(batchSize) } };
  }

  if (!token || !isUuid(input.job_id) || Object.keys(input).some((key) => key !== "job_id")) {
    return { ok: false, response: reply({ error: "unauthorized" }, 401) };
  }
  return { ok: true, mode: { kind: "user", jobId: input.job_id } };
}

async function claimSecretJobs(
  admin: ReturnType<typeof createClient>,
  workerId: string,
  batchSize: number,
): Promise<ClaimedJobsResult> {
  const { data, error } = await admin.rpc("claim_async_export_jobs", {
    p_worker: workerId,
    p_limit: batchSize,
    p_lease_seconds: 300,
    p_job_id: null,
  });
  if (error) {
    console.error("async export claim failed", { code: error.code ?? "unknown" });
    return { ok: false, response: reply({ error: "claim_failed" }, 500) };
  }
  return { ok: true, jobs: (data ?? []) as Job[] };
}

async function claimRequesterJob(
  url: string,
  anonKey: string,
  token: string,
  jobId: string,
): Promise<ClaimedJobsResult> {
  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userResult.user) {
    return { ok: false, response: reply({ error: "unauthorized" }, 401) };
  }

  const { data, error } = await userClient.rpc("claim_my_async_export_job", {
    p_job_id: jobId,
    p_worker: "requester:" + userResult.user.id + ":" + crypto.randomUUID(),
  });
  if (error) {
    console.error("async export request claim failed", { code: error.code ?? "unknown" });
    return { ok: false, response: reply({ error: "claim_failed" }, 409) };
  }

  const jobs = (data ?? []) as Job[];
  if (!jobs.length) return { ok: false, response: reply({ error: "job_not_claimable" }, 409) };
  return { ok: true, jobs };
}

async function claimJobs(
  admin: ReturnType<typeof createClient>,
  url: string,
  anonKey: string,
  token: string,
  workerId: string,
  mode: WorkerMode,
): Promise<ClaimedJobsResult> {
  if (mode.kind === "secret") return claimSecretJobs(admin, workerId, mode.batchSize);
  return claimRequesterJob(url, anonKey, token, mode.jobId);
}

async function respondToClaimedJobs(
  admin: ReturnType<typeof createClient>,
  mode: WorkerMode,
  jobs: Job[],
): Promise<Response> {
  await cleanExpired(admin);
  if (!jobs.length) return reply({ accepted: true, claimed: 0 }, 202);

  const work = Promise.all(jobs.map((job) => processJob(admin, job)));
  const edge = (globalThis as unknown as { EdgeRuntime?: EdgeBackground }).EdgeRuntime;
  if (mode.kind === "user" && edge?.waitUntil) {
    edge.waitUntil(work);
    return reply({ accepted: true, claimed: jobs.length, job_id: jobs[0].id }, 202);
  }

  await work;
  return reply({ accepted: true, claimed: jobs.length, job_id: jobs[0]?.id ?? null }, 202);
}

async function handleWorkerRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const url = runtime!.env.get("SUPABASE_URL");
  const anonKey = runtime!.env.get("SUPABASE_ANON_KEY");
  const serviceKey = runtime!.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply({ error: "worker_not_configured" }, 503);

  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] ?? "";
  const expectedSecret = runtime!.env.get("ASYNC_EXPORT_WORKER_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-async-export-worker-secret") ?? "";
  const secretMode = Boolean(expectedSecret && constantTimeEqual(suppliedSecret, expectedSecret));

  const bodyRead = await readBoundedTextBody(request.body, 4096, request.headers.get("content-length"));
  if (!bodyRead.ok) return requestBodyFailure(bodyRead.reason);

  const payload = parseWorkerPayload(bodyRead.text);
  if (!payload.ok) return payload.response;

  const modeResult = resolveWorkerMode(payload.input, secretMode, token);
  if (!modeResult.ok) return modeResult.response;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const workerId = "async-export:" + crypto.randomUUID();
  const claim = await claimJobs(admin, url, anonKey, token, workerId, modeResult.mode);
  if (!claim.ok) return claim.response;

  return respondToClaimedJobs(admin, modeResult.mode, claim.jobs);
}


runtime!.serve(handleWorkerRequest);

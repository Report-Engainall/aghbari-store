import { createClient } from "npm:@supabase/supabase-js@2";
import { readBoundedTextBody } from "../_shared/bounded-body.ts";
import { createOutboxWorkerHandler } from "./handler.ts";

type WorkerRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const runtime = (globalThis as unknown as { Deno?: WorkerRuntime }).Deno;
if (!runtime) throw new Error("This worker must run in the Supabase Edge Runtime.");

runtime.serve(createOutboxWorkerHandler({
  getEnv: (name) => runtime.env.get(name),
  readBody: (request) => readBoundedTextBody(
    request.body,
    4096,
    request.headers.get("content-length"),
  ),
  createClient: (url, serviceKey) => {
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return {
      rpc: async (procedure, parameters) => {
        // RPC names are selected by this worker; generated Supabase function types are unavailable here.
        const result = await client.rpc(procedure as never, parameters as never);
        return { data: result.data, error: result.error };
      },
    };
  },
  createId: () => crypto.randomUUID(),
  logError: (message, context) => console.error(message, context),
}));

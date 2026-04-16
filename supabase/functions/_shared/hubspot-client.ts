import {
  HUBSPOT_BATCH_MAX,
  HUBSPOT_BATCH_CONCURRENCY,
  HUBSPOT_REQUEST_TIMEOUT_MS,
  HUBSPOT_REQUEST_MAX_RETRIES,
  HUBSPOT_RETRY_BASE_DELAY_MS,
} from "./constants.ts";
import type { RequestMetrics } from "./types.ts";

const HUBSPOT_ACCESS_TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN") ?? "";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(limit, tasks.length));
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  const workers = Array.from({ length: safeLimit }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= tasks.length) break;
      results[current] = await tasks[current]();
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Creates a new metrics tracker for each request.
 * Avoids global mutable state / race conditions between concurrent requests.
 */
export function createMetrics(): RequestMetrics {
  return { hubspotRequestCount: 0 };
}

/**
 * Central HubSpot HTTP function with retry logic, timeout, and metrics tracking.
 */
export async function hubspotRequest(
  path: string,
  method: string,
  body?: Record<string, unknown>,
  options?: {
    timeoutMs?: number;
    maxRetries?: number;
    metrics?: RequestMetrics;
  },
): Promise<Record<string, unknown>> {
  const timeoutMs = options?.timeoutMs ?? HUBSPOT_REQUEST_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? HUBSPOT_REQUEST_MAX_RETRIES;
  const metrics = options?.metrics;
  let attempt = 0;

  while (attempt <= maxRetries) {
    if (metrics) metrics.hubspotRequestCount += 1;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort("timeout"),
      timeoutMs,
    );

    try {
      const response = await fetch(`https://api.hubapi.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text();
        const retriable = response.status === 429 || response.status >= 500;
        if (retriable && attempt < maxRetries) {
          const backoff =
            HUBSPOT_RETRY_BASE_DELAY_MS * 2 ** attempt +
            Math.floor(Math.random() * 100);
          await sleep(backoff);
          attempt += 1;
          continue;
        }
        throw new Error(
          `HubSpot request failed (${response.status}): ${details}`,
        );
      }

      const raw = await response.text();
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    } catch (error: unknown) {
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      if ((isAbort || error instanceof TypeError) && attempt < maxRetries) {
        const backoff =
          HUBSPOT_RETRY_BASE_DELAY_MS * 2 ** attempt +
          Math.floor(Math.random() * 100);
        await sleep(backoff);
        attempt += 1;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw new Error("HubSpot request failed after retries");
}

/**
 * Batch-read HubSpot objects by ID, chunked and with concurrency limit.
 */
export async function batchReadHubspotObjects(
  objectType: string,
  ids: Array<number | string>,
  properties: string[],
  metrics?: RequestMetrics,
): Promise<Map<string, Record<string, unknown>>> {
  const normalizedIds = [
    ...new Set(ids.map((id) => String(id)).filter(Boolean)),
  ];
  if (normalizedIds.length === 0) return new Map();

  const resultMap = new Map<string, Record<string, unknown>>();
  const chunks = chunkArray(normalizedIds, HUBSPOT_BATCH_MAX);
  const tasks = chunks.map((chunk) => async () => {
    const response = await hubspotRequest(
      `/crm/v3/objects/${objectType}/batch/read`,
      "POST",
      {
        properties,
        inputs: chunk.map((id) => ({ id })),
      },
      { metrics },
    );
    const results = (response?.results ?? []) as Array<{
      id?: string;
      [key: string]: unknown;
    }>;
    for (const entry of results) {
      if (entry?.id) resultMap.set(String(entry.id), entry);
    }
  });

  await runWithConcurrencyLimit(tasks, HUBSPOT_BATCH_CONCURRENCY);
  return resultMap;
}

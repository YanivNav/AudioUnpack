import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { transcriptCallbackSchema } from "@audio-unpack/core";

const http = httpRouter();

/**
 * Callback endpoint the Modal job POSTs to as it progresses and when it finishes.
 * Reachable at `https://<deployment>.convex.site/modal/transcript`.
 *
 * Auth: Modal must send the shared secret (CONVEX_CALLBACK_SECRET) in the
 * `x-callback-secret` header. Fails closed if the secret isn't configured.
 */
http.route({
  path: "/modal/transcript",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CONVEX_CALLBACK_SECRET;
    if (!secret || request.headers.get("x-callback-secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }

    let body;
    try {
      body = transcriptCallbackSchema.parse(await request.json());
    } catch (err) {
      return new Response(
        `bad request: ${err instanceof Error ? err.message : String(err)}`,
        { status: 400 },
      );
    }

    await ctx.runMutation(internal.jobs.applyUpdate, {
      jobId: body.jobId as Id<"jobs">,
      status: body.status,
      progress: body.progress,
      error: body.error,
      // Flatten the TranscriptionResult onto the job row.
      ...(body.result
        ? {
            transcript: body.result.text,
            language: body.result.language,
            segments: body.result.segments,
            durationSeconds: body.result.durationSeconds,
          }
        : {}),
    });

    return new Response(null, { status: 200 });
  }),
});

export default http;

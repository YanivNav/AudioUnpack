import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

/**
 * Callback endpoint the Modal job POSTs to as it progresses and when it finishes.
 * Reachable at `https://<deployment>.convex.site/modal/transcript`.
 *
 * Auth: Modal must send a shared secret (CONVEX_CALLBACK_SECRET) in a header.
 */
http.route({
  path: "/modal/transcript",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    // TODO(impl):
    //   1. verify request.headers.get("x-callback-secret") === process.env.CONVEX_CALLBACK_SECRET
    //   2. const body = transcriptCallbackSchema.parse(await request.json()); // from @audio-unpack/core
    //   3. await ctx.runMutation(internal.jobs.applyUpdate, { jobId, status, progress, ...result });
    //   4. return new Response(null, { status: 200 });
    void request;
    return new Response("TODO(impl): transcript callback not implemented", {
      status: 501,
    });
  }),
});

export default http;

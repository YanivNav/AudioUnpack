import { mutation } from "./_generated/server";

/**
 * Returns a short-lived upload URL. The frontend POSTs the audio file directly to it,
 * gets back a storageId, then calls `jobs.create` with that id.
 * Docs: https://docs.convex.dev/file-storage/upload-files
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

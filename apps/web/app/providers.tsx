"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState } from "react";

/**
 * Client-side Convex provider. The browser talks to Convex directly over a websocket,
 * so this lives in a client component wrapping the app in the root layout.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn(
        "NEXT_PUBLIC_CONVEX_URL is not set — run `npx convex dev` and copy it into .env",
      );
    }
    return new ConvexReactClient(url ?? "");
  });

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

"use client";

import { useState } from "react";
import { Uploader } from "@/components/Uploader";
import { JobView } from "@/components/JobView";
import { useIframeAutoResize } from "@/lib/iframe-resize";

/**
 * Standalone app shell. Also the iframe target for the Wix embed (path A).
 * Single-job MVP: upload → watch live status → read transcript → summarize.
 */
export default function Page() {
  useIframeAutoResize(); // posts height to the Wix host when embedded
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  return (
    <main className="app">
      <header>
        <h1>audio-unpack</h1>
        <p>Transcribe audio of any format, then summarize the conversation.</p>
      </header>

      <Uploader onJobCreated={setActiveJobId} />
      {activeJobId && <JobView jobId={activeJobId} />}
    </main>
  );
}

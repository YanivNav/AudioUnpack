import { useEffect } from "react";

/**
 * When the app runs inside an iframe (Wix embed path A), post the document height to the
 * host so the Wix HTML element can resize to fit. The Wix side listens for this message.
 */
export function useIframeAutoResize(): void {
  useEffect(() => {
    if (window.self === window.top) return; // not embedded

    const postHeight = () => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "audio-unpack:resize", height }, "*");
    };

    const observer = new ResizeObserver(postHeight);
    observer.observe(document.documentElement);
    postHeight();

    return () => observer.disconnect();
  }, []);
}

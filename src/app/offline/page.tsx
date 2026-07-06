import { WifiOff } from "lucide-react";

/** Offline fallback shell — cached by the service worker at install and shown
 *  only when a navigation fails. Deliberately data-free: no numbers here. */
export default function OfflinePage() {
  return (
    <section className="panel" style={{ maxWidth: 560 }}>
      <h2 className="ptitle">
        <WifiOff className="ic" size={16} aria-hidden />
        You&apos;re offline
      </h2>
      <p className="empty-note">
        Clarity shows live numbers straight from your bank, so it needs a
        connection. Once you&apos;re back online, reload and everything picks up
        where it left off.
      </p>
    </section>
  );
}

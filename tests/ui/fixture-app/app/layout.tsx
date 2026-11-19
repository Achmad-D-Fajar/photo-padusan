import "../../../../src/app/globals.css";
import "../../../../tokens.css";
import "../../../../src/components/dashboard/watermark.css";

export default function FixtureLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body><main className="watermark-page max-w-6xl mx-auto p-4">{children}</main></body></html>;
}

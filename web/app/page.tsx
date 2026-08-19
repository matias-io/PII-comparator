import { ComparisonWorkbench } from "@/components/comparison-workbench";

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="PII Compare home">
          <span className="brand-mark" aria-hidden="true">
            uO
          </span>
          <span>PII Compare</span>
        </a>
        <span className="header-note">Evaluation workspace</span>
      </header>

      <div id="top" className="page-shell">
        <ComparisonWorkbench />

        <footer className="site-footer">
          <p>
            {/* The environment label defaults to DEV ENV if unset */}
            {process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL ??
              `development ` +
                `(proxy: ${process.env.NEXT_PUBLIC_PROXY_URL ?? "n/a"})`}
          </p>
        </footer>
      </div>
    </main>
  );
}

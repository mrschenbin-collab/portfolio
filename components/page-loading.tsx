export function PageLoading({ label = "LOADING WORKS" }: { label?: string }) {
  return (
    <main className="page-loading section-pad" aria-busy="true" aria-live="polite">
      <p className="eyebrow">{label}</p>
      <div className="page-loading-line" />
      <span>正在同步内容</span>
    </main>
  );
}

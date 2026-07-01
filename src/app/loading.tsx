/** Instant skeleton shown while a page's live data loads, so navigation feels
 *  immediate instead of blocking on the server render. */
export default function Loading() {
  const line = (w: string, h = 14, mt = 10) => (
    <div className="skel" style={{ width: w, height: h, marginTop: mt }} />
  );
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="kpis">
        {[0, 1, 2].map((i) => (
          <section className="panel" key={i}>
            {line("40%", 11, 0)}
            {line("70%", 34, 14)}
            {line("50%")}
          </section>
        ))}
      </div>
      <div className="grid-main">
        <div className="col">
          <section className="panel">
            {line("35%", 14, 0)}
            {line("100%", 120, 16)}
          </section>
        </div>
        <div className="col">
          <section className="panel">
            {line("45%", 14, 0)}
            {line("100%", 80, 16)}
          </section>
        </div>
      </div>
    </div>
  );
}

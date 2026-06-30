export function PageHead({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2
        style={{
          fontFamily: "var(--font-display-stack)",
          fontWeight: 700,
          fontSize: 24,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

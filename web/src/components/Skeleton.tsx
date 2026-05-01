interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 6, style }: SkeletonProps) {
  return (
    <div
      style={{
        width, height, borderRadius,
        background: "var(--skeleton-bg, #e5e7eb)",
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-card)" }}>
      <Skeleton height={20} width="60%" style={{ marginBottom: 16 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={`${70 + Math.random() * 30}%`} style={{ marginBottom: 10 }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} style={{ padding: "10px 12px", borderBottom: "2px solid var(--border)" }}>
              <Skeleton height={12} width="70%" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r} style={{ borderBottom: "1px solid var(--border)" }}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c} style={{ padding: "10px 12px" }}>
                <Skeleton height={13} width={`${50 + Math.random() * 50}%`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

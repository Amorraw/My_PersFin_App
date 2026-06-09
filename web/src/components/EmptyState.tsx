// Reusable placeholder card with icon, title, description, and optional CTA button
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

// Renders centered dashed-border card; action button is omitted when prop absent
export default function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "48px 24px", textAlign: "center",
        background: "var(--bg)", borderRadius: 12, border: "1px dashed var(--border)",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 14, color: "var(--text-light)", maxWidth: 360, lineHeight: 1.5, marginBottom: action ? 20 : 0 }}>
          {description}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 4, padding: "9px 20px", borderRadius: 8,
            background: "var(--primary)", color: "white", border: "none",
            fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

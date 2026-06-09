// Global toast notification system with auto-dismiss and manual close support
import { createContext, useContext, useState, useCallback, useRef } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const COLORS: Record<ToastType, string> = {
  success: "#059669",
  error:   "#dc2626",
  warning: "#d97706",
  info:    "#2563eb",
};

// Renders toasts in a fixed bottom-right stack; caps queue at 5 to avoid overflow
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    // Keep only the 5 most recent toasts to avoid a growing stack
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, 4000);
    timers.current.set(id, timer);
  }, []);

  const dismiss = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 99999,
          display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "12px 16px", borderRadius: 10, color: "white",
              fontSize: 14, fontWeight: 500, maxWidth: 380, minWidth: 240,
              background: COLORS[t.type],
              boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
              animation: "toast-in 0.25s ease",
              pointerEvents: "all",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{ICONS[t.type]}</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.8)",
                fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

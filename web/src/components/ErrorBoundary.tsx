// Class component that catches render errors and shows a reload fallback UI
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Unexpected UI error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary caught:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card">
          <h3>Something went wrong on this page</h3>
          <p style={{ marginBottom: "1rem" }}>{this.state.message}</p>
          <button onClick={this.handleReload}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

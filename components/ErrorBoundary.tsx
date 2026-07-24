import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// React unmounts the entire tree on an uncaught render error with no boundary
// in place, which presents to the user as the whole app going blank. This is
// a last-resort safety net so a single bad render (e.g. an unexpected parse
// failure) degrades to a recoverable message instead of a dead white screen.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 bg-primary text-text-main p-6 text-center">
          <p className="text-lg font-medium">發生錯誤，畫面無法顯示</p>
          <p className="text-sm text-text-secondary max-w-md">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            重試
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

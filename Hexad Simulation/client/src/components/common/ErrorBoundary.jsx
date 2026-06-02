import React from 'react';
import { Card } from './Card';
import { Button } from './Button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Keep logging lightweight; host environments may capture console output.
    // eslint-disable-next-line no-console
    console.error('UI crashed:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || 'Unexpected UI error';

    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
        <Card className="p-6 max-w-xl w-full">
          <h1 className="text-xl font-semibold gradient-text">Something went wrong</h1>
          <p className="text-slate-400 mt-2 text-sm break-words">{message}</p>
          <div className="mt-4">
            <Button variant="primary" onClick={this.handleReload}>
              Reload
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            If this only happens on the deployed site, double-check the backend API URL and rate limits.
          </p>
        </Card>
      </div>
    );
  }
}

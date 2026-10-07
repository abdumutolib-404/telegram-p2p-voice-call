import { Brand } from './Brand';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Copy, Check, Terminal } from 'lucide-react';
import { logger } from '../services/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showLogs: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
    showLogs: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      copied: false,
      showLogs: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ReactBoundary', `Rendering crashed: ${error.message}`, {
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    this.setState({
      error,
      errorInfo,
    });
  }

  private handleCopyLogs = () => {
    const diagnosticPayload = {
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      logs: logger.getLogs(),
    };

    navigator.clipboard.writeText(JSON.stringify(diagnosticPayload, null, 2));
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const logs = logger.getLogs();

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-white text-center">
          <div className="mb-8"><Brand /></div>
          <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mb-6 shadow-lg shadow-red-500/10">
            <AlertOctagon className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-2xl font-bold text-slate-100 mb-2">Application Rendering Error</h1>
          <p className="text-slate-400 text-sm max-w-sm mb-6 leading-relaxed">
            An unexpected error occurred while rendering the Mini App. You can copy the diagnostic logs below to send for troubleshooting.
          </p>

          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 text-left overflow-hidden">
            <p className="text-xs font-sans text-red-400 font-semibold mb-2 truncate">
              {this.state.error?.name}: {this.state.error?.message}
            </p>
            {this.state.error?.stack && (
              <pre className="text-[10px] font-mono text-slate-400 bg-slate-950 p-3 rounded-lg overflow-x-auto max-h-32">
                {this.state.error.stack}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <button
              onClick={this.handleCopyLogs}
              className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 border border-slate-700"
            >
              {this.state.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-mint-400" />}
              <span>{this.state.copied ? 'Logs Copied!' : 'Copy Diagnostic Logs'}</span>
            </button>

            <button
              onClick={() => this.setState((prev) => ({ showLogs: !prev.showLogs }))}
              className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 border border-slate-700"
            >
              <Terminal className="w-4 h-4 text-mint-400" />
              <span>{this.state.showLogs ? 'Hide Logs' : 'View Network Logs'}</span>
            </button>

            <button
              onClick={this.handleReload}
              className="py-2.5 px-4 bg-mint-600 hover:bg-mint-300 text-slate-950 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 shadow-md shadow-mint-600/30"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload App</span>
            </button>
          </div>

          {this.state.showLogs && (
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left">
              <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-mint-400" />
                <span>Captured Client Logs ({logs.length})</span>
              </h3>
              <div className="bg-slate-950 p-3 rounded-lg max-h-48 overflow-y-auto font-mono text-[10px] space-y-1.5">
                {logs.length === 0 ? (
                  <p className="text-slate-500 italic">No logs recorded yet.</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="leading-tight">
                      <span className="text-slate-500">[{log.timestamp.split('T')[1].slice(0, 8)}]</span>{' '}
                      <span className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : 'text-mint-300'}>
                        [{log.category}]
                      </span>{' '}
                      <span className="text-slate-300">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

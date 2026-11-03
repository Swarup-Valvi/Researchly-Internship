export function LoadingSpinner({ message = 'Loading conferences...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-slate-500 animate-fadeIn" role="status">
      <div className="w-9 h-9 border-3 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-3" />
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card p-8 my-6 text-center max-w-lg mx-auto border-rose-200 bg-rose-50/40" role="alert">
      <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-xl mb-3">
        ⚠️
      </div>
      <h3 className="text-base font-semibold text-rose-900 mb-1">Failed to load content</h3>
      <p className="text-sm text-rose-700 mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-xs">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  message,
  icon = '🔍',
  actionText,
  onAction,
}: {
  message: string;
  icon?: string;
  actionText?: string;
  onAction?: () => void;
}) {
  return (
    <div className="card p-12 text-center my-6">
      <div className="text-4xl mb-3 select-none">{icon}</div>
      <p className="text-sm text-slate-600 max-w-sm mx-auto mb-4">{message}</p>
      {actionText && onAction && (
        <button onClick={onAction} className="btn-secondary text-xs">
          {actionText}
        </button>
      )}
    </div>
  );
}

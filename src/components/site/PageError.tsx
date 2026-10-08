import { Link } from '@tanstack/react-router';

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint, e.code].filter(Boolean).join('\n');
  }
  return error ? String(error) : '';
}

export function PageError(props: Record<string, unknown>) {
  const error = props['error'];
  if (error) console.error('[PageError]', error);
  const detail = describeError(error);
  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <h1 className="text-3xl">Não foi possível carregar esta página</h1>
      {import.meta.env.DEV && detail && (
        <pre className="mt-6 whitespace-pre-wrap rounded border p-4 text-xs">{detail}</pre>
      )}
      <Link to="/" className="mt-6 inline-block text-primary">Voltar ao início</Link>
    </div>
  );
}

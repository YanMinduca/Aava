import { Link } from '@tanstack/react-router';
export function PageError() {
  return <div className="mx-auto max-w-3xl px-5 py-20"><h1 className="text-3xl">Não foi possível carregar esta página</h1><Link to="/" className="mt-6 inline-block text-primary">Voltar ao início</Link></div>;
}
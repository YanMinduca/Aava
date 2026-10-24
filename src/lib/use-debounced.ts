import { useEffect, useState } from "react";

/** Devolve o valor só depois que ele parar de mudar por `ms` milissegundos. */
export function useDebounced<T>(value: T, ms = 600): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

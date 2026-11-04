import { useEffect, useState } from "react";

/**
 * Whether the component has mounted in the browser. The server render
 * can't reach `/rpc`, so a query's failure is only real once this is true;
 * before that, show the loading state the browser's first render shows too
 * (otherwise hydration fails).
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

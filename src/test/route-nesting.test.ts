import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No TanStack Router, "a.b.tsx" é FILHA de "a.tsx". Se "a.tsx" não renderiza <Outlet />,
 * a URL de "a/b" muda mas a tela de "a" continua aparecendo (a página filha "não abre").
 * Para páginas irmãs, use "a.index.tsx" (lista) + "a.$id.tsx" (detalhe), sem "a.tsx".
 */
function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routeFiles(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );
}

describe("rotas aninhadas", () => {
  it("toda rota pai (a.tsx) de uma rota filha (a.b.tsx) renderiza <Outlet />", () => {
    const root = join(process.cwd(), "src/routes");
    const problems: string[] = [];
    for (const file of routeFiles(root)) {
      const base = file.replace(/\.tsx$/, "");
      const name = base.split("/").pop()!;
      const lastDot = name.lastIndexOf(".");
      if (lastDot === -1) continue;
      const parent = join(base.slice(0, base.length - name.length), `${name.slice(0, lastDot)}.tsx`);
      if (existsSync(parent) && !readFileSync(parent, "utf8").includes("Outlet")) {
        problems.push(`${parent.replace(root, "src/routes")} é pai de ${file.replace(root, "src/routes")} mas não tem <Outlet />`);
      }
    }
    expect(problems).toEqual([]);
  });
});

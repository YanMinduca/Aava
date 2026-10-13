import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/site/Markdown";
import { stripMarkdown } from "@/lib/site-content";

const html = (md: string) => renderToStaticMarkup(<Markdown>{md}</Markdown>);

describe("Markdown dos textos do site", () => {
  it("separa parágrafos e aplica negrito e itálico", () => {
    const out = html("Primeiro **parágrafo** aqui.\n\nSegundo *parágrafo*.");
    expect(out.match(/<p /g)).toHaveLength(2);
    expect(out).toContain("<strong");
    expect(out).toContain("<em>parágrafo</em>");
  });

  it("transforma Enter simples em quebra de linha", () => {
    expect(html("linha 1\nlinha 2")).toContain("<br/>");
  });

  it("renderiza listas e links", () => {
    const out = html("- um\n- dois\n\n[site](https://exemplo.com)");
    expect(out).toContain("<ul");
    expect(out.match(/<li>/g)).toHaveLength(2);
    expect(out).toContain('href="https://exemplo.com"');
  });

  it("ignora HTML cru e links perigosos", () => {
    const out = html("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain('href="javascript');
  });

  it("stripMarkdown deixa só o texto puro para a descrição do Google", () => {
    expect(stripMarkdown("Olá **mundo**\n\n- item [link](https://a.com)")).toBe("Olá mundo item link");
  });
});

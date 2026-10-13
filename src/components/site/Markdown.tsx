import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

/**
 * Renderiza textos editáveis do site em Markdown.
 * Suporta parágrafos (linha em branco), **negrito**, *itálico*, listas, citações e links.
 * HTML cru é ignorado, então o texto é seguro. Um "Enter" simples já vira quebra de linha.
 */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        allowedElements={["p", "br", "strong", "em", "del", "ul", "ol", "li", "blockquote", "a", "h1", "h2", "h3", "h4"]}
        unwrapDisallowed
        components={{
          p: ({ node: _n, ...p }) => <p className="mt-4 first:mt-0" {...p} />,
          strong: ({ node: _n, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
          ul: ({ node: _n, ...p }) => <ul className="mt-4 list-disc space-y-1 pl-5 first:mt-0" {...p} />,
          ol: ({ node: _n, ...p }) => <ol className="mt-4 list-decimal space-y-1 pl-5 first:mt-0" {...p} />,
          blockquote: ({ node: _n, ...p }) => (
            <blockquote className="mt-4 border-l-2 border-primary pl-4 italic first:mt-0" {...p} />
          ),
          h1: ({ node: _n, ...p }) => <p className="mt-4 text-lg font-semibold text-foreground first:mt-0" {...p} />,
          h2: ({ node: _n, ...p }) => <p className="mt-4 text-lg font-semibold text-foreground first:mt-0" {...p} />,
          h3: ({ node: _n, ...p }) => <p className="mt-4 font-semibold text-foreground first:mt-0" {...p} />,
          h4: ({ node: _n, ...p }) => <p className="mt-4 font-semibold text-foreground first:mt-0" {...p} />,
          a: ({ node: _n, ...p }) => (
            <a className="font-medium text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...p} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

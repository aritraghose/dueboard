import * as React from "react";
import { type ExtraProps, Streamdown, useIsCodeFenceIncomplete } from "streamdown";
import { useHighlightedCode } from "@/hooks/use-highlighted-code";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@/components/ui/code-block";

/**
 * Markdown from the chat agent, rendered as it streams. Fenced code goes to a
 * Code Block (line numbers, copy button); inline code stays inline.
 */
export function Markdown({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      components={components}
      className="flex flex-col gap-3 text-sm leading-relaxed"
    >
      {children}
    </Streamdown>
  );
}

function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
  // True while the closing fence has not arrived yet.
  const incomplete = useIsCodeFenceIncomplete();
  const lines = useHighlightedCode(code, language);

  return (
    <CodeBlock>
      <CodeBlockHeader>
        <CodeBlockTitle>{language || "text"}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={code} disabled={incomplete} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
}

function MarkdownCode({
  node: _node,
  className,
  children,
  ...props
}: React.ComponentProps<"code"> & ExtraProps) {
  // Streamdown marks fenced code with data-block. Everything else is inline.
  if (!("data-block" in props)) {
    return (
      <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]" {...props}>
        {children}
      </code>
    );
  }

  return (
    <MarkdownCodeBlock
      code={typeof children === "string" ? children : ""}
      language={/language-(\S+)/.exec(className ?? "")?.[1] ?? ""}
    />
  );
}

// The model can write image links to any host. Show their alt text instead,
// so a reply never loads anything from outside the app.
function MarkdownImage({ alt }: React.ComponentProps<"img"> & ExtraProps) {
  return alt ? <span className="text-muted-foreground">[{alt}]</span> : null;
}

const components = { code: MarkdownCode, img: MarkdownImage };

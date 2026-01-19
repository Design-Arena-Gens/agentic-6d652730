"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PreviewPage = () => {
  const params = useParams<{ id: string }>();
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`agentic.preview.${params.id}`);
    if (stored) {
      setContent(stored);
    } else {
      setContent("");
    }
  }, [params.id]);

  if (content === null) {
    return null;
  }

  return (
    <div style={{ maxWidth: "800px", margin: "4rem auto", padding: "0 1.5rem" }}>
      {content ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        <div
          style={{
            padding: "2rem",
            borderRadius: "1rem",
            background: "rgba(15, 23, 42, 0.6)",
            textAlign: "center"
          }}
        >
          <p style={{ color: "#cbd5f5" }}>No preview content available. Generate a blog post from the dashboard first.</p>
        </div>
      )}
    </div>
  );
};

export default PreviewPage;

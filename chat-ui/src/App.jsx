import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL = "http://127.0.0.1:8000/ask";

/* ─── Markdown component renderers ─── */
const markdownComponents = {
  p:      ({ children }) => <p style={md.p}>{children}</p>,
  strong: ({ children }) => <strong style={md.strong}>{children}</strong>,
  /* bold followed by ' –' or ' -' acts as a mini-heading — handled via CSS on strong */
  em:     ({ children }) => <em style={md.em}>{children}</em>,
  h1:     ({ children }) => <h1 style={md.h1}>{children}</h1>,
  h2:     ({ children }) => <h2 style={md.h2}>{children}</h2>,
  h3:     ({ children }) => <h3 style={md.h3}>{children}</h3>,
  ul:     ({ children }) => <ul style={md.ul}>{children}</ul>,
  ol:     ({ children }) => <ol style={md.ol}>{children}</ol>,
  li:     ({ children }) => <li style={md.li}>{children}</li>,
  code: ({ node, children, ...props }) => {
    const isBlock = node?.position?.start?.line !== node?.position?.end?.line ||
      (typeof children === 'string' && children.includes('\n'));
    return isBlock
      ? <pre style={md.pre}><code style={md.code} {...props}>{children}</code></pre>
      : <code style={md.inlineCode} {...props}>{children}</code>;
  },
  blockquote: ({ children }) => <blockquote style={md.blockquote}>{children}</blockquote>,
  hr:     () => <hr style={md.hr} />,
  a:      ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={md.a}>{children}</a>
  ),
  // ── GFM table elements ──
  table:  ({ children }) => (
    <div style={md.tableWrapper}>
      <table style={md.table}>{children}</table>
    </div>
  ),
  thead:  ({ children }) => <thead style={md.thead}>{children}</thead>,
  tbody:  ({ children }) => <tbody>{children}</tbody>,
  tr:     ({ children, ...props }) => {
    const idx = props.node?.position?.start?.line ?? 0;
    return <tr style={idx % 2 === 0 ? md.trEven : md.trOdd}>{children}</tr>;
  },
  th:     ({ children }) => <th style={md.th}>{children}</th>,
  td:     ({ children }) => <td style={md.td}>{children}</td>,
};

/* ─── User bubble ─── */
function UserBubble({ text }) {
  return (
    <div style={s.row("flex-end")}>
      <div style={{ ...s.bubble, ...s.userBubble }}>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{text}</p>
      </div>
      <div style={s.userAvatar}>👤</div>
    </div>
  );
}

/* ─── Bot bubble ─── */
function BotBubble({ text, sources, isError }) {
  const truncate = (url) => {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/$/, "");
      const short = path.split("/").slice(-2).join("/") || u.hostname;
      return short.length > 40 ? short.slice(0, 38) + "…" : short;
    } catch {
      return url.slice(0, 40) + "…";
    }
  };

  return (
    <div style={s.row("flex-start")}>
      <div style={s.botAvatar}>🤖</div>
      <div
        style={{
          ...s.bubble,
          ...(isError ? s.errorBubble : s.botBubble),
        }}
      >
        {isError ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}>{text}</p>
        ) : (
          <div style={s.markdownBody}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>
          </div>
        )}

        {sources && sources.length > 0 && (
          <div style={s.sourcesArea}>
            <span style={s.sourcesLabel}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "middle" }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Sources
            </span>
            <div style={s.pillsRow}>
              {sources.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.pill}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#1e1b4b";
                    e.currentTarget.style.borderColor = "#6366f1";
                    e.currentTarget.style.color = "#c7d2fe";
                    e.currentTarget.style.boxShadow = "0 0 10px #6366f130, inset 0 0 0 1px #6366f1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#0d1117";
                    e.currentTarget.style.borderColor = "#1e293b";
                    e.currentTarget.style.color = "#818cf8";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  {truncate(url)}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Loading dots ─── */
function LoadingBubble() {
  return (
    <div style={s.row("flex-start")}>
      <div style={s.botAvatar}>🤖</div>
      <div style={{ ...s.bubble, ...s.botBubble, ...s.loadingBubble }}>
        {[0, 0.18, 0.36].map((delay, i) => (
          <span key={i} style={{ ...s.dot, animationDelay: `${delay}s` }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Main App ─── */
export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 0,
      type: "bot",
      text: "👋 Hi! I'm your **RAG assistant**.\n\nAsk me anything and I'll search the knowledge base and answer using the most relevant context.",
      sources: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const messagesRef = useRef(null);

  // Auto-scroll to bottom whenever messages or loading changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(e) {
    if (e) e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    // Get the last 3 exchanges (6 messages), ignoring errors and the initial welcome message
    const validMessages = messages.filter((m) => m.id !== 0 && !m.isError);
    const recentMessages = validMessages.slice(-6).map((m) => ({
      role: m.type === "bot" ? "assistant" : "user",
      content: m.text,
    }));

    setMessages((prev) => [...prev, { id: Date.now(), type: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: recentMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, type: "bot", text: data.answer, sources: data.sources || [] },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, type: "bot", text: `⚠️ ${err.message}`, sources: [], isError: true },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #090c14; }
        #root { height: 100dvh; display: flex; flex-direction: column; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        textarea:focus { outline: none; }

        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40%            { transform: translateY(-7px); opacity: 1; }
        }
      `}</style>

      <div style={s.shell}>
        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <div style={s.logoRing}>🧠</div>
            <div>
              <div style={s.appName}>RAG Chatbot</div>
              <div style={s.appSub}>pgvector · Groq · Sentence‑Transformers</div>
            </div>
          </div>
          <div style={s.onlineBadge}>
            <span style={s.onlineDot} />
            Online
          </div>
        </header>

        {/* ── Messages ── */}
        <div style={s.messages} ref={messagesRef}>
          {messages.map((msg) =>
            msg.type === "user"
              ? <UserBubble key={msg.id} text={msg.text} />
              : <BotBubble  key={msg.id} text={msg.text} sources={msg.sources} isError={msg.isError} />
          )}
          {loading && <LoadingBubble />}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>

        {/* ── Input ── */}
        <div style={s.inputSection}>
          <form style={s.inputWrap} onSubmit={handleSend}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              style={s.textarea}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                ...s.sendBtn,
                ...(loading || !input.trim() ? s.sendBtnOff : {}),
              }}
            >
              {loading ? (
                <span style={{ fontSize: 18, lineHeight: 1 }}>⏳</span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>
          <p style={s.hint}>Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════
   Layout / component styles
════════════════════════════ */
const s = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    maxWidth: "860px",
    margin: "0 auto",
    background: "#0d1117",
    color: "#e2e8f0",
  },

  /* Header */
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 22px",
    background: "linear-gradient(135deg,#0f172a 0%,#1a1040 100%)",
    borderBottom: "1px solid #1e293b",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  logoRing: {
    fontSize: 26,
    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    borderRadius: 12,
    padding: "6px 9px",
    lineHeight: 1,
    boxShadow: "0 0 16px #6366f155",
  },
  appName: { fontSize: 16, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.3px" },
  appSub:  { fontSize: 11, color: "#475569", marginTop: 2 },
  onlineBadge: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, color: "#86efac", fontWeight: 600,
    background: "#052e16", border: "1px solid #16a34a",
    borderRadius: 999, padding: "4px 10px",
  },
  onlineDot: {
    width: 7, height: 7, borderRadius: "50%",
    background: "#22c55e", boxShadow: "0 0 6px #22c55e",
    display: "inline-block",
  },

  /* Messages list */
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  /* Row alignment helper */
  row: (justify) => ({
    display: "flex",
    justifyContent: justify,
    alignItems: "flex-end",
    gap: 10,
  }),

  /* Avatars */
  userAvatar: {
    flexShrink: 0,
    width: 32, height: 32, borderRadius: "50%",
    background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, border: "1px solid #6366f1",
  },
  botAvatar: {
    flexShrink: 0,
    width: 32, height: 32, borderRadius: "50%",
    background: "linear-gradient(135deg,#1e1b4b,#312e81)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, border: "1px solid #4338ca",
    marginBottom: 2,
  },

  /* Bubbles */
  bubble: {
    maxWidth: "74%",
    borderRadius: 18,
    padding: "12px 16px",
    fontSize: 14.5,
    lineHeight: 1.65,
    wordBreak: "break-word",
  },
  userBubble: {
    background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
    color: "#fff",
    borderBottomRightRadius: 4,
    boxShadow: "0 4px 18px #6366f130",
  },
  botBubble: {
    background: "#161d2b",
    color: "#cbd5e1",
    border: "1px solid #1e293b",
    borderBottomLeftRadius: 4,
    boxShadow: "0 2px 10px #00000030",
  },
  errorBubble: {
    background: "#1a0a0a",
    color: "#fca5a5",
    border: "1px solid #7f1d1d",
    borderBottomLeftRadius: 4,
  },
  loadingBubble: {
    display: "flex", alignItems: "center", gap: 7,
    padding: "14px 18px", minWidth: 70,
  },

  /* Markdown wrapper — gives children spacing room */
  markdownBody: { lineHeight: 1.7 },

  /* Sources */
  sourcesArea: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #1e293b",
  },
  sourcesLabel: {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    color: "#475569",
    marginBottom: 8,
  },
  pillsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px 3px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
    background: "#0d1117",
    color: "#818cf8",
    border: "1px solid #1e293b",
    borderLeft: "3px solid #4338ca",
    textDecoration: "none",
    transition: "background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s",
    whiteSpace: "nowrap",
    maxWidth: 240,
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
    letterSpacing: "0.1px",
  },

  /* Loading dot */
  dot: {
    display: "inline-block",
    width: 9, height: 9, borderRadius: "50%",
    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    animation: "dotBounce 1.15s ease-in-out infinite",
  },

  /* Input */
  inputSection: {
    padding: "12px 18px 16px",
    borderTop: "1px solid #1e293b",
    background: "#0d1117",
    flexShrink: 0,
  },
  inputWrap: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    background: "#161d2b",
    border: "1.5px solid #1e293b",
    borderRadius: 16,
    padding: "8px 8px 8px 16px",
    transition: "border-color 0.2s",
  },
  textarea: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "#e2e8f0",
    fontSize: 14.5,
    resize: "none",
    fontFamily: "inherit",
    lineHeight: 1.55,
    maxHeight: 130,
    overflowY: "auto",
    paddingTop: 2,
  },
  sendBtn: {
    flexShrink: 0,
    width: 40, height: 40,
    borderRadius: 12,
    background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 12px #6366f140",
    transition: "opacity 0.2s, transform 0.1s",
  },
  sendBtnOff: { opacity: 0.3, cursor: "not-allowed", boxShadow: "none" },
  hint: {
    fontSize: 11,
    color: "#1e293b",
    textAlign: "center",
    marginTop: 8,
    letterSpacing: "0.2px",
  },
};

/* ════════════════════════════
   Markdown element styles
════════════════════════════ */
const md = {
  p:     { margin: "0 0 16px", lineHeight: 1.8, color: "#cbd5e1" },
  strong:{
    display: "inline-block",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 15,
    marginTop: 14,
    marginBottom: 2,
    letterSpacing: "-0.1px",
  },
  em:    { color: "#a5b4fc", fontStyle: "italic" },
  h1:    { fontSize: 20, fontWeight: 700, color: "#f8fafc", margin: "18px 0 8px", borderBottom: "1px solid #1e293b", paddingBottom: 6 },
  h2:    { fontSize: 17, fontWeight: 700, color: "#f1f5f9", margin: "16px 0 7px" },
  h3:    { fontSize: 15, fontWeight: 600, color: "#e2e8f0", margin: "14px 0 6px" },
  ul:    { margin: "6px 0 10px 20px", paddingLeft: 4 },
  ol:    { margin: "6px 0 10px 20px", paddingLeft: 4 },
  li:    { margin: "4px 0", color: "#cbd5e1", lineHeight: 1.65 },
  inlineCode: {
    fontFamily: "'Fira Code', 'Courier New', monospace",
    fontSize: 13,
    background: "#0f172a",
    color: "#a5b4fc",
    padding: "1px 6px",
    borderRadius: 5,
    border: "1px solid #1e293b",
  },
  pre: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    padding: "12px 16px",
    overflowX: "auto",
    margin: "10px 0",
  },
  code: {
    fontFamily: "'Fira Code', 'Courier New', monospace",
    fontSize: 13,
    color: "#a5b4fc",
    lineHeight: 1.6,
  },
  blockquote: {
    borderLeft: "3px solid #6366f1",
    paddingLeft: 14,
    margin: "10px 0",
    color: "#64748b",
    fontStyle: "italic",
  },
  hr: { border: "none", borderTop: "1px solid #1e293b", margin: "14px 0" },
  a:  { color: "#818cf8", textDecoration: "underline" },

  // ── Tables ──
  tableWrapper: {
    overflowX: "auto",
    margin: "12px 0",
    borderRadius: 10,
    border: "1px solid #1e293b",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13.5,
    fontFamily: "inherit",
  },
  thead: {
    background: "linear-gradient(135deg,#1e1b4b,#1e293b)",
  },
  th: {
    padding: "9px 14px",
    textAlign: "left",
    fontWeight: 600,
    color: "#a5b4fc",
    borderBottom: "2px solid #3730a3",
    whiteSpace: "nowrap",
    letterSpacing: "0.3px",
  },
  td: {
    padding: "8px 14px",
    color: "#cbd5e1",
    borderBottom: "1px solid #1e293b",
    lineHeight: 1.55,
    verticalAlign: "top",
  },
  trEven: { background: "#0d1117" },
  trOdd:  { background: "#111827" },
};

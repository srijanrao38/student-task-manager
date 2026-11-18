import { useState, useRef, useEffect } from "react";

// Same base URL App.js uses for its API calls.
const API_BASE = "http://localhost:8000";

function formatArgs(args) {
  const entries = Object.entries(args || {});
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(", ") : "";
}

export default function AgentPanel({ onTasksChanged }) {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'agent' | 'error', text, tools }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    // Last 10 user/agent messages as conversation memory (errors are not sent).
    const history = messages
      .filter((msg) => msg.role === "user" || msg.role === "agent")
      .slice(-10)
      .map((msg) => ({ role: msg.role === "agent" ? "model" : "user", text: msg.text.slice(0, 2000) }));
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages((m) => [...m, { role: "error", text: data.error || "Agent request failed" }]);
      } else {
        setMessages((m) => [...m, { role: "agent", text: data.reply, tools: data.tools_called || [] }]);
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "error", text: "Could not reach the server." }]);
    } finally {
      setLoading(false);
      if (onTasksChanged) onTasksChanged();
    }
  };

  return (
    <div className="mb-8 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">AI Agent</h2>

      <div ref={listRef} className="h-64 overflow-y-auto space-y-3 mb-3 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Ask me to list, add or reschedule tasks, e.g. "What's due this week?"
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-[85%]">
              <div
                className={
                  "px-3 py-2 rounded-xl text-sm whitespace-pre-wrap " +
                  (msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : msg.role === "error"
                    ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100")
                }
              >
                {msg.text}
              </div>
              {msg.tools && msg.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {msg.tools.map((t, j) => (
                    <span
                      key={j}
                      title={formatArgs(t.args)}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-slate-400 dark:text-slate-500 animate-pulse">Thinking…</p>}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the agent…"
          disabled={loading}
          className="flex-grow px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition duration-200"
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PieChart, Pie, Cell, BarChart, Bar, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../api';
import { CHART_PALETTE, CHART_LINE, CHART_CHARCOAL_SOFT } from '../chartColors';

// The model replies in markdown (bold, lists, etc.) — render it instead of
// showing the raw "**2.00**" syntax. Overrides only fix spacing/sizing to
// match the chat bubble; everything else is react-markdown's default.
const MARKDOWN_COMPONENTS = {
  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: ({ node, ...props }) => <li {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
  code: ({ node, ...props }) => (
    <code className="rounded bg-cream px-1 py-0.5 font-mono text-[12px]" {...props} />
  ),
  a: ({ node, ...props }) => <a className="underline" target="_blank" rel="noreferrer" {...props} />,
};

function AssistantText({ text }) {
  return (
    <div className="text-[13.5px] leading-[1.6]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

const SUGGESTED_PROMPTS = [
  'How much did I spend on food last month?',
  'Am I on track for retirement?',
  'Where can I cut spending?',
  "What's my biggest recurring charge?",
];

function parseChartBlock(text) {
  const match = text.match(/```chart\s*([\s\S]*?)```/);
  if (!match) return { text, chart: null };
  const cleanText = text.replace(match[0], '').trim();
  try {
    const chart = JSON.parse(match[1].trim());
    return { text: cleanText, chart };
  } catch {
    return { text, chart: null };
  }
}

function InlineChart({ chart }) {
  if (!chart?.data?.length) return null;
  if (chart.type === 'pie') {
    return (
      <div className="mt-3 rounded-xl border border-line bg-cream p-4">
        {chart.title && <p className="mb-2 font-body text-[12px] font-semibold text-charcoal">{chart.title}</p>}
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={chart.data} dataKey="value" nameKey="label" innerRadius={40} outerRadius={75} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
              {chart.data.map((entry, i) => (
                <Cell key={entry.label} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-line bg-cream p-4">
      {chart.title && <p className="mb-2 font-body text-[12px] font-semibold text-charcoal">{chart.title}</p>}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chart.data}>
          <CartesianGrid stroke={CHART_LINE} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: CHART_CHARCOAL_SOFT }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10.5, fill: CHART_CHARCOAL_SOFT }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6eae5', fontSize: 12 }} />
          <Bar dataKey="value" fill="#00bf63" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Insights() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const res = await api.post('/api/insights/chat', { messages: nextMessages });
      setMessages([...nextMessages, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Something went wrong reaching the insights model.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen flex-col p-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-charcoal">Insights</h1>
      <p className="mb-6 font-body text-[13.5px] text-charcoal-soft">
        Ask about your real accounts, spending, budgets, and forecast.
      </p>

      <div ref={scrollRef} className="mb-4 flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="mc-card p-6">
            <p className="font-body text-[13.5px] text-charcoal-soft">
              Try one of these, or ask your own question below.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="mc-chat-bubble-user max-w-lg">{m.content}</div>
              </div>
            );
          }
          const { text, chart } = parseChartBlock(m.content);
          return (
            <div key={i} className="flex justify-start">
              <div className="mc-chat-bubble-assistant max-w-lg">
                <AssistantText text={text} />
                <InlineChart chart={chart} />
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="mc-chat-bubble-assistant text-charcoal-soft">Thinking…</div>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-negative/30 bg-coral-soft p-4 font-body text-[13px] text-negative">
            {error}
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((p) => (
          <button key={p} onClick={() => send(p)} disabled={sending} className="mc-prompt-chip">
            {p}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your finances…"
          className="mc-input flex-1"
        />
        <button type="submit" disabled={sending || !input.trim()} className="mc-btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}

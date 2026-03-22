'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChatStore } from '@/hooks/useChatStore';
import * as api from '@/lib/api';
import type { DailyUsage, PaymentRecord } from '@/lib/api';

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function UsageChart({ data }: { data: DailyUsage[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        No usage data yet.
      </div>
    );
  }

  const maxTokens = Math.max(...data.map(d => d.input_tokens + d.output_tokens), 1);

  // Show last 30 days padded; fill missing days with 0
  const today = new Date();
  const days: { date: string; label: string; input: number; output: number; cost: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const match = data.find(r => r.date === key);
    days.push({
      date: key,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      input: match?.input_tokens ?? 0,
      output: match?.output_tokens ?? 0,
      cost: match?.cost_usd ?? 0,
    });
  }

  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="relative">
      <div className="flex gap-0.5 h-40">
        {days.map((day, i) => {
          const total = day.input + day.output;
          const heightPct = total / maxTokens;
          const inputH = heightPct * (day.input / (total || 1));
          const outputH = heightPct * (day.output / (total || 1));
          const isHovered = hovered === i;

          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col justify-end cursor-default"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {isHovered && total > 0 && (
                <div className="absolute bottom-full mb-2 z-10
                  bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl pointer-events-none"
                  style={{ left: `${(i / days.length) * 100}%` }}
                >
                  <div className="font-medium text-gray-200 mb-1">{day.label}</div>
                  <div className="text-gray-400">Input: <span className="text-minai-400">{day.input.toLocaleString()}</span></div>
                  <div className="text-gray-400">Output: <span className="text-minai-300">{day.output.toLocaleString()}</span></div>
                  <div className="text-gray-400 mt-0.5">Cost: <span className="text-white">${Number(day.cost).toFixed(4)}</span></div>
                </div>
              )}
              {/* Stacked bar */}
              <div
                className="w-full rounded-sm bg-minai-300 transition-opacity"
                style={{ height: `${outputH * 100}%`, minHeight: total > 0 ? 1 : 0, opacity: isHovered ? 1 : 0.75 }}
              />
              <div
                className="w-full rounded-sm bg-minai-600 transition-opacity"
                style={{ height: `${inputH * 100}%`, minHeight: total > 0 ? 1 : 0, opacity: isHovered ? 1 : 0.75 }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels — show every 5th */}
      <div className="flex items-start gap-0.5 mt-1.5">
        {days.map((day, i) => (
          <div key={day.date} className="flex-1 text-center">
            {i % 5 === 0 && (
              <span className="text-[9px] text-gray-500 leading-none">
                {day.label.replace(' ', '\u00A0')}
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-minai-600" /> Input tokens
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-minai-300" /> Output tokens
        </span>
      </div>
    </div>
  );
}

// ─── User Memory Editor ──────────────────────────────────────────────────────

const MAX_MEMORY_CHARS = 2000;

function MemoryEditor() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getUserMemory()
      .then(({ memory_text }) => setText(memory_text))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (value: string) => {
    const trimmed = value.slice(0, MAX_MEMORY_CHARS);
    setText(trimmed);
    setSaved(false);
    // Debounced auto-save
    if (saveTimerRef[0]) clearTimeout(saveTimerRef[0]);
    saveTimerRef[0] = setTimeout(() => {
      setSaving(true);
      api.setUserMemory(value)
        .then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); })
        .catch(console.error)
        .finally(() => setSaving(false));
    }, 800);
  };

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-100">User Memory</h2>
        <span className="text-xs text-gray-500">
          {saving ? 'Saving...' : saved ? '✓ Saved' : `${text.length} / ${MAX_MEMORY_CHARS}`}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Personal facts about you that minai remembers across conversations. minai also adds to this when you share something important in chat.
      </p>
      {loading ? (
        <div className="h-32 flex items-center justify-center text-gray-500 text-sm">Loading...</div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="e.g. I'm vegan, I prefer window seats, my daughter's name is Sofia..."
          rows={6}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200
            placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-minai-500/30 resize-none"
        />
      )}
    </section>
  );
}

// ─── Transaction History (credits + daily debits) ───────────────────────────

interface LedgerEntry {
  type: 'credit' | 'debit' | 'grant';
  date: Date;
  amount: number;
  label: string;
  detail?: string;
  txHash?: string | null;
}

function TransactionHistory({ dailyUsage }: { dailyUsage: DailyUsage[] }) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPayments()
      .then(setPayments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Merge credits and daily debits into a single timeline
  const entries: LedgerEntry[] = [];

  // Group free credits by day, keep real top-ups as individual rows
  const grantsByDay = new Map<string, number>();
  for (const p of payments) {
    if (p.payment_method === 'celo') {
      entries.push({
        type: 'credit',
        date: new Date(p.created_at),
        amount: p.amount_usd,
        label: `Top-up (${p.token ?? 'crypto'})`,
        txHash: p.tx_hash,
      });
    } else {
      const dayKey = new Date(p.created_at).toISOString().slice(0, 10);
      grantsByDay.set(dayKey, (grantsByDay.get(dayKey) ?? 0) + p.amount_usd);
    }
  }
  for (const [day, total] of grantsByDay) {
    entries.push({
      type: 'grant',
      date: new Date(day + 'T12:00:00'),
      amount: total,
      label: 'Free credits',
    });
  }

  for (const d of dailyUsage) {
    if (d.cost_usd > 0) {
      const tokens = d.input_tokens + d.output_tokens;
      entries.push({
        type: 'debit',
        date: new Date(d.date + 'T12:00:00'),
        amount: d.cost_usd,
        label: 'Usage',
        detail: `${tokens.toLocaleString()} tokens (${d.message_count} messages)`,
      });
    }
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <h2 className="font-semibold text-gray-100 mb-1">Transaction History</h2>
      <p className="text-xs text-gray-500 mb-4">Credits and daily usage.</p>

      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-5 h-5 border-2 border-minai-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-gray-500 text-sm">
          No transactions yet.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {entries.map((e, i) => {
            const dateStr = e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isCredit = e.type === 'credit';
            const isDebit = e.type === 'debit';
            const celoscanUrl = e.txHash ? `https://celoscan.io/tx/${e.txHash}` : null;

            return (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    ${isCredit ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                    {isDebit ? '-' : '+'}
                  </div>
                  <div>
                    <div className="text-sm text-gray-200">
                      {e.label}
                      {celoscanUrl && (
                        <a href={celoscanUrl} target="_blank" rel="noopener noreferrer"
                          className="ml-1.5 text-xs text-minai-400 hover:text-minai-300">
                          {e.txHash!.slice(0, 6)}...{e.txHash!.slice(-4)}
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {dateStr}
                      {e.detail && <span className="ml-1">— {e.detail}</span>}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-medium ${isCredit ? 'text-green-400' : 'text-gray-400'}`}>
                  {isDebit ? '-' : '+'}${e.amount.toFixed(4)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, session, checkSession } = useChatStore();
  const [usage, setUsage] = useState<{ daily: DailyUsage[]; totals: { total_input: number; total_output: number; total_cost: number } } | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const googleConnected = !!session?.user?.google_id;
  const justConnected = searchParams.get('google_connected') === '1';

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    // Refresh session to pick up newly linked Google account
    if (justConnected) checkSession();

    api.getUsage(30)
      .then(setUsage)
      .catch(console.error)
      .finally(() => setLoadingUsage(false));
  }, [isAuthenticated, router, justConnected, checkSession]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400"
          title="Back"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">

        {/* ── Google Calendar ─────────────────────────────────── */}
        <section className={`border rounded-2xl p-6 transition-colors
          ${justConnected
            ? 'bg-green-950/30 border-green-800'
            : 'bg-gray-900 border-gray-800'}`}
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" fill="#fff" stroke="#e5e7eb" strokeWidth="1"/>
                <rect x="3" y="8" width="18" height="2" fill="#4285F4"/>
                <rect x="7" y="2" width="2" height="4" rx="1" fill="#4285F4"/>
                <rect x="15" y="2" width="2" height="4" rx="1" fill="#4285F4"/>
                <text x="12" y="19" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#4285F4">CAL</text>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-semibold text-gray-100">Google Calendar</h2>
                {googleConnected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                    bg-green-900/50 border border-green-700 text-green-400 text-xs font-medium">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    Connected
                  </span>
                )}
              </div>

              {googleConnected ? (
                <>
                  <div className="flex items-center gap-2.5 mb-4">
                    {session?.user?.avatar_url && (
                      <img src={session.user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                    )}
                    <div>
                      {session?.user?.display_name && (
                        <div className="text-sm font-medium text-gray-200">{session.user.display_name}</div>
                      )}
                      {session?.user?.email && (
                        <div className="text-xs text-gray-400">{session.user.email}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.location.href = '/api/auth/google?source=settings'}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-700
                        text-gray-400 text-xs hover:border-gray-600 hover:text-gray-300 transition-colors"
                    >
                      Re-authorize
                    </button>
                    <button
                      onClick={async () => {
                        await fetch('/api/auth/google/disconnect', { method: 'POST', credentials: 'include' });
                        await checkSession();
                        router.replace('/settings');
                      }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-700
                        text-gray-500 text-xs hover:border-red-800 hover:text-red-400 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400 mb-4">
                    Connect your Google Calendar so Minai can check availability, schedule events,
                    and manage meetings across your client notebooks.
                  </p>
                  <button
                    onClick={() => window.location.href = '/api/auth/google?source=settings'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-gray-50
                      text-gray-800 text-sm font-medium transition-colors shadow-sm"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Connect Google Calendar
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── User Memory ───────────────────────────────────────── */}
        <MemoryEditor />

        {/* ── Transaction History ──────────────────────────────── */}
        <TransactionHistory dailyUsage={usage?.daily ?? []} />

        {/* ── Token usage chart ───────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-100">Token Usage</h2>
            <span className="text-xs text-gray-500">Last 30 days</span>
          </div>

          {/* Totals row */}
          {usage && (
            <div className="flex gap-6 mb-6 mt-3">
              <div>
                <div className="text-2xl font-bold text-minai-400">
                  {(usage.totals.total_input + usage.totals.total_output).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Total tokens</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-200">
                  ${Number(usage.totals.total_cost).toFixed(4)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Total spent</div>
              </div>
              {session?.balance && (
                <div>
                  <div className="text-2xl font-bold text-green-400">
                    ${Number(session.balance.balance_usd).toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Balance remaining</div>
                </div>
              )}
            </div>
          )}

          {loadingUsage ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-5 h-5 border-2 border-minai-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <UsageChart data={usage?.daily ?? []} />
          )}
        </section>

      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}

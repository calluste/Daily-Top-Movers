import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"];

interface Mover {
  date: string;
  ticker: string;
  pctChange: number;
  closePrice: number;
}

function App() {
  const [movers, setMovers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/movers`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setMovers(data.movers ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // newest first (API already sorts desc, but guarantee it)
  const sorted = [...movers].sort((a, b) => b.date.localeCompare(a.date));
  const featured = sorted[0];
  const rest = sorted.slice(1);

  // chart data oldest -> newest
  const chartData = [...movers]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date.slice(5), pctChange: m.pctChange, ticker: m.ticker }));

  // --- summary stats ---
  const biggest = movers.reduce(
    (max, m) => (Math.abs(m.pctChange) > Math.abs(max.pctChange) ? m : max),
    movers[0] ?? { pctChange: 0, ticker: "—" } as Mover
  );
  const freq: Record<string, number> = {};
  movers.forEach((m) => (freq[m.ticker] = (freq[m.ticker] ?? 0) + 1));
  const topMover = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  const avgMove =
    movers.length > 0
      ? movers.reduce((sum, m) => sum + Math.abs(m.pctChange), 0) / movers.length
      : 0;

  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });

  return (
    <div className="page">
      <div className="container">
        <header className="header">
          <div>
            <h1>Daily Top Movers</h1>
            <p className="subtitle">Biggest mover among 6 tech stocks, each trading day</p>
          </div>
          {featured && (
            <span className="updated">Updated {fmtDate(featured.date)}</span>
          )}
        </header>

        <div className="watchlist">
          {WATCHLIST.map((t) => (
            <span className="chip" key={t}>{t}</span>
          ))}
        </div>

        {loading && <p className="status">Loading market data…</p>}
        {error && <p className="status error">Couldn't load data. {error}</p>}
        {!loading && !error && movers.length === 0 && (
          <p className="status">No movers recorded yet. Check back after the next market close.</p>
        )}

        {!loading && !error && movers.length > 0 && (
          <>
            <section className="stats">
              <div className="stat">
                <span className="stat-label">Biggest Move (7d)</span>
                <span className={`stat-value ${biggest.pctChange >= 0 ? "up" : "down"}`}>
                  {biggest.pctChange >= 0 ? "+" : ""}{biggest.pctChange.toFixed(2)}%
                </span>
                <span className="stat-sub">{biggest.ticker}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Top Mover</span>
                <span className="stat-value">{topMover?.[0] ?? "—"}</span>
                <span className="stat-sub">{topMover?.[1] ?? 0} of {movers.length} days</span>
              </div>
              <div className="stat">
                <span className="stat-label">Avg Move</span>
                <span className="stat-value">{avgMove.toFixed(2)}%</span>
                <span className="stat-sub">absolute</span>
              </div>
              <div className="stat">
                <span className="stat-label">Days Tracked</span>
                <span className="stat-value">{movers.length}</span>
                <span className="stat-sub">trading days</span>
              </div>
            </section>

            {featured && (
              <section className="featured">
                <span className="featured-tag">Latest</span>
                <div className="featured-body">
                  <div className="featured-left">
                    <span className="featured-ticker">{featured.ticker}</span>
                    <span className="featured-date">{fmtDate(featured.date)}</span>
                  </div>
                  <div className="featured-right">
                    <span className={`featured-pct ${featured.pctChange >= 0 ? "up" : "down"}`}>
                      {featured.pctChange >= 0 ? "▲" : "▼"} {Math.abs(featured.pctChange).toFixed(2)}%
                    </span>
                    <span className="featured-price">${featured.closePrice.toFixed(2)}</span>
                  </div>
                </div>
              </section>
            )}

            <section className="chart-section">
              <h2 className="section-title">7-Day History</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <ReferenceLine y={0} stroke="#48484a" />
                  <XAxis dataKey="date" stroke="#86868b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#86868b" fontSize={12} unit="%" tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    formatter={(value, _name, item) => [
                      `${item?.payload?.ticker ?? ""}  ${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`,
                      "Mover",
                    ]}
                    contentStyle={{
                      background: "#1c1c1e", border: "1px solid #38383a",
                      borderRadius: 12,
                    }}
                    labelStyle={{ color: "#f5f5f7", fontWeight: 600, marginBottom: 4 }}
                    itemStyle={{ color: "#f5f5f7" }}
                  />
                  <Bar dataKey="pctChange" radius={[5, 5, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.pctChange >= 0 ? "#30d158" : "#ff453a"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="grid-section">
              <h2 className="section-title">Earlier Days</h2>
              <div className="grid">
                {rest.map((m) => (
                  <div className="card" key={m.date}>
                    <div className="card-row">
                      <span className="card-ticker">{m.ticker}</span>
                      <span className={`card-pct ${m.pctChange >= 0 ? "up" : "down"}`}>
                        {m.pctChange >= 0 ? "+" : ""}{m.pctChange.toFixed(2)}%
                      </span>
                    </div>
                    <div className="card-row sub">
                      <span>{fmtDate(m.date)}</span>
                      <span>${m.closePrice.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="footer">Data via Massive · Updated each weekday at 6:30 PM ET</footer>
      </div>
    </div>
  );
}

export default App;
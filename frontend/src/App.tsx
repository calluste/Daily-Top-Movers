import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "";

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

  const chartData = [...movers]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date.slice(5), pctChange: m.pctChange, ticker: m.ticker }));

  return (
    <div className="container">
      <header>
        <h1>Daily Top Movers</h1>
        <p className="subtitle">Biggest mover in the watchlist, by trading day</p>
      </header>

      {loading && <p className="status">Loading…</p>}
      {error && <p className="status error">Failed to load: {error}</p>}

      {!loading && !error && movers.length === 0 && (
        <p className="status">No data yet — check back after the next market close.</p>
      )}

      {!loading && !error && movers.length > 0 && (
        <>
          <section className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} unit="%" />
                <Tooltip
		  formatter={(value) => [`${Number(value).toFixed(2)}%`, "Change"]}
                  contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }}
                />
                <Bar dataKey="pctChange" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.pctChange >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="cards">
            {movers.map((m) => (
              <div className="card" key={m.date}>
                <div className="card-top">
                  <span className="ticker">{m.ticker}</span>
                  <span className={`pct ${m.pctChange >= 0 ? "up" : "down"}`}>
                    {m.pctChange >= 0 ? "▲" : "▼"} {Math.abs(m.pctChange).toFixed(2)}%
                  </span>
                </div>
                <div className="card-bottom">
                  <span className="date">{m.date}</span>
                  <span className="price">${m.closePrice.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export default App;
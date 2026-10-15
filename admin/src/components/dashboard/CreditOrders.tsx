import { useEffect, useState } from "react";
import { adminFetch } from "../../api/client";
type Order = {
  id: string;
  calls: number;
  recordings: number;
  storage: number;
  starsAmount: number;
  uzsAmount: number;
  status: string;
  createdAt: string;
  user: { alias: string };
};
export function CreditOrders() {
  const [orders, setOrders] = useState<Order[]>([]),
    [next, setNext] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void adminFetch<{ orders: Order[]; nextCursor: string | null }>(
      "/api/admin/credit-orders" +
        (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setOrders(result.orders);
          setNext(result.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Purchases are unavailable.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cursor, attempt]);
  return (
    <section className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
      <h2>Credit purchases</h2>
      <p>
        Confirmed Stars payments, pending checkouts and refund confirmations.
        UZS amounts are references and are excluded from card-payment revenue.
      </p>
      {loading && <p role="status">Loading credit purchases…</p>}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {!loading && !error && (
        <div
          className="table-container"
          role="region"
          tabIndex={0}
          aria-label="Credit purchases"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date / order</th>
                <th scope="col">Learner</th>
                <th scope="col">Calls</th>
                <th scope="col">Recordings</th>
                <th scope="col">Storage</th>
                <th scope="col">Stars</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    {new Date(order.createdAt).toLocaleDateString()}
                    <br />
                    {order.id.slice(0, 8)}
                  </td>
                  <td>{order.user.alias}</td>
                  <td>{order.calls}</td>
                  <td>{order.recordings}</td>
                  <td>{order.storage}</td>
                  <td>{order.starsAmount}</td>
                  <td>{order.status.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && <p>No credit purchases on this page.</p>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          className="btn-secondary"
          type="button"
          disabled={loading}
          onClick={() => {
            setCursor(null);
            setAttempt((n) => n + 1);
          }}
        >
          Refresh latest
        </button>
        {next && (
          <button
            className="btn-secondary"
            type="button"
            disabled={loading || !!error}
            onClick={() => setCursor(next)}
          >
            Older purchases
          </button>
        )}
      </div>
    </section>
  );
}

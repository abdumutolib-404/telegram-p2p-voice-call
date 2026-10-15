import { useEffect, useState } from "react";
import { dashboardRequest } from "../services/dashboard";
type CreditAccount = {
  balance: { calls: number; recordings: number; storage: number };
  orders: {
    id: string;
    calls: number;
    recordings: number;
    storage: number;
    starsAmount: number;
    status: string;
    createdAt: string;
  }[];
};
export function CreditBalance({
  initData,
  revision,
}: {
  initData: string;
  revision: number;
}) {
  const [data, setData] = useState<CreditAccount | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!initData) return;
    const controller = new AbortController();
    void dashboardRequest<CreditAccount>(initData, "/credits", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Your balance is unavailable.",
          );
      });
    return () => controller.abort();
  }, [initData, revision, attempt]);
  if (!initData) return null;
  return (
    <section
      className="credit-account"
      aria-label="Your credit balance"
      style={{
        marginBottom: 24,
        padding: 20,
        border: "1px solid var(--app-border)",
        borderRadius: 18,
      }}
    >
      <h3>Your balance</h3>
      {error ? (
        <p role="alert">{error}</p>
      ) : data ? (
        <p>
          {data.balance.calls} call credits · {data.balance.recordings}{" "}
          recording credits · {data.balance.storage} storage credits
        </p>
      ) : (
        <p role="status">Checking your credits…</p>
      )}
      <button
        className="secondary-button"
        type="button"
        onClick={() => setAttempt((n) => n + 1)}
      >
        Refresh balance
      </button>
      {data && (
        <details>
          <summary
            style={{
              cursor: "pointer",
              minHeight: 44,
              display: "flex",
              alignItems: "center",
            }}
          >
            Recent credit purchases
          </summary>
          {data.orders.length ? (
            data.orders.map((order) => (
              <p key={order.id} style={{ fontSize: 13, lineHeight: 1.7 }}>
                {new Date(order.createdAt).toLocaleDateString()} · {order.calls}{" "}
                calls · {order.recordings} recordings · {order.starsAmount}{" "}
                Stars ·{" "}
                {order.status === "PAID"
                  ? "Paid"
                  : order.status === "REFUNDED"
                    ? "Refunded"
                    : order.status === "REFUND_PENDING"
                      ? "Refund confirmation pending"
                      : "Awaiting payment"}
                <br />
                <span style={{ overflowWrap: "anywhere" }}>
                  Order {order.id.slice(0, 8)}
                </span>
              </p>
            ))
          ) : (
            <p>No credit purchases yet. Your starter gift is separate.</p>
          )}
          <p>
            Use /refund in the bot for payment help. Legacy subscription
            purchases remain in their original history.
          </p>
        </details>
      )}
    </section>
  );
}

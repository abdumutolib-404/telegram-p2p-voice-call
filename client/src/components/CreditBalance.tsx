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
    uzsAmount:number;
    checkoutCurrency?:'XTR'|'UZS'|null;
    expiresAt?:string;
    authorizedAt?:string|null;
    packSnapshot?:string|null;
    status: string;
    createdAt: string;
  }[];
};
export function CreditBalance({
  initData,
  revision,
  onResume,
}: {
  initData: string;
  revision: number;
  onResume?:(orderId:string)=>void;
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
      aria-label="Your balance"
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
          {data.balance.calls} calls · {data.balance.recordings}{" "}
          recordings · {data.balance.storage} storage add-ons
          <br/><small>Balances are in 15-minute units. A 30-minute call, recording or retention add-on uses two.</small>
        </p>
      ) : (
        <p role="status">Checking your balance…</p>
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
            Recent purchases
          </summary>
          {data.orders.length ? (
            data.orders.map((order) => (
              <p key={order.id} style={{ fontSize: 13, lineHeight: 1.7 }}>
                {new Date(order.createdAt).toLocaleDateString()} · {order.calls}{" "}
                call units · {order.recordings} recording units · {order.checkoutCurrency==='UZS'?`${order.uzsAmount.toLocaleString('en-US')} UZS`:`${order.starsAmount} Stars`} ·{" "}
                {order.status === "PAID"
                  ? "Paid"
                  : order.status === "REFUNDED"
                    ? "Refunded"
                    : order.status === "REFUND_PENDING"
                      ? "Refund confirmation pending"
                      : order.status==='CANCELLED'?'Cancelled':order.status==='EXPIRED'||(order.expiresAt&&Date.parse(order.expiresAt)<=Date.now())?'Expired':'Awaiting payment'}
                <br />
                <span style={{ overflowWrap: "anywhere" }}>
                  Order {order.id.slice(0, 8)}
                </span>
                {onResume&&order.packSnapshot&&order.status==='PENDING'&&!order.authorizedAt&&order.expiresAt&&Date.parse(order.expiresAt)>Date.now()&&<button type="button" className="text-button" onClick={()=>onResume(order.id)}>Resume checkout</button>}
              </p>
            ))
          ) : (
            <p>No purchases yet. Your starter gift is separate.</p>
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

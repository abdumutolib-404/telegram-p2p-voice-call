import { usePublicStats } from "../lib/publicStats";
const number = (n: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(n);
export function StatsSummary({
  fallbackFeatures = false,
}: {
  fallbackFeatures?: boolean;
}) {
  const { data } = usePublicStats();
  if (!data && fallbackFeatures)
    return (
      <div className="stats-summary">
        {[
          ["Three", "Speaking parts to practice"],
          ["Four", "Core speaking skills"],
          ["Together", "Learn through conversation"],
        ].map(([value, label]) => (
          <div className="stat-item" key={label}>
            <strong className="stat-value">{value}</strong>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </div>
    );
  return (
    <div className="stats-summary">
      {[
        {
          label: "Completed practice calls",
          value: data ? number(data.completedCalls) : "Not available yet",
        },
        {
          label: "Hours of conversation",
          value: data
            ? new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
                data.practiceHours,
              )
            : "Not available yet",
        },
        {
          label: "Learners who have practiced",
          value: data ? number(data.practicingLearners) : "Not available yet",
        },
      ].map((s) => (
        <div className="stat-item" key={s.label}>
          <strong className={`stat-value ${data ? "" : "stat-unavailable"}`}>
            {s.value}
          </strong>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
export function StatsPage() {
  const { data, loading, failed, retry } = usePublicStats();
  const maximum = Math.max(1, ...(data?.monthly.map((m) => m.calls) ?? []));
  const ratingVisible =
    data && data.ratings.count >= 5 && data.ratings.average !== null;
  return (
    <>
      <section className="container page-intro">
        <a className="breadcrumb" href="/">
          PairTalk /
        </a>
        <p className="eyebrow">OUR COMMUNITY, IN CONTEXT</p>
        <h1>
          Every conversation
          <br />
          adds up.
        </h1>
        <p>
          A transparent view of speaking practice on PairTalk. Real activity,
          clear definitions, and no invented milestones.
        </p>
      </section>
      <div className="container stats-page-content">
        {!data && (
          <div className="stats-status" role="status">
            <p>
              {loading
                ? "Checking for the latest community figures…"
                : "Community figures are temporarily unavailable. We show no estimated or sample numbers in their place."}
            </p>
            {failed && (
              <button type="button" onClick={retry}>
                Try again
              </button>
            )}
          </div>
        )}
        {data && failed && (
          <div className="stats-status" role="status">
            <p>
              Showing the last available snapshot. The latest update could not
              be retrieved.
            </p>
            <button type="button" onClick={retry}>
              Refresh figures
            </button>
          </div>
        )}
        <StatsSummary />
        {data && (
          <p className="stats-date">
            Snapshot:{" "}
            {new Date(data.updatedAt)
              .toISOString()
              .replace("T", " ")
              .slice(0, 16)}{" "}
            UTC · Updated approximately every 15 minutes.
          </p>
        )}
        <div className="stats-page-grid">
          <section className="stats-panel">
            <p className="eyebrow">A ROUTINE, ONE MONTH AT A TIME</p>
            <h2>Conversations over time.</h2>
            <p>
              Completed calls during the last six calendar months, including the
              current partial month.
            </p>
            {data ? (
              <>
                <div className="chart" aria-hidden="true">
                  {data.monthly.map((m) => (
                    <div className="chart-column" key={m.month}>
                      <span>{number(m.calls)}</span>
                      <div
                        className="chart-bar"
                        style={{ height: `${(m.calls / maximum) * 135}px` }}
                      />
                      <span>
                        {new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString(
                          "en",
                          { month: "short", timeZone: "UTC" },
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      Monthly completed calls and session hours
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Month (UTC)</th>
                        <th scope="col">Calls</th>
                        <th scope="col">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthly.map((m) => (
                        <tr key={m.month}>
                          <th scope="row">{m.month}</th>
                          <td>{number(m.calls)}</td>
                          <td>{m.hours.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="stats-hint">
                The chart will appear when verified figures are available.
              </p>
            )}
          </section>
          <section className="stats-panel">
            <p className="eyebrow">FEEDBACK FROM COMPLETED CALLS</p>
            <h2>How learners rated calls.</h2>
            <p>
              Optional post-call ratings on a 1–5 scale. These are session
              feedback, not official test results or a technical audio
              benchmark.
            </p>
            {ratingVisible ? (
              <>
                <div className="rating-number">
                  {data.ratings.average!.toFixed(1)}
                  <span> / 5</span>
                </div>
                <p>Based on {number(data.ratings.count)} submitted ratings.</p>
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count =
                    data.ratings.distribution.find((r) => r.stars === stars)
                      ?.count ?? 0;
                  return (
                    <div className="rating-row" key={stars}>
                      <span>{stars} ★</span>
                      <div className="rating-track" aria-hidden="true">
                        <div
                          className="rating-fill"
                          style={{
                            width: `${(count / data.ratings.count) * 100}%`,
                          }}
                        />
                      </div>
                      <span>{number(count)} ratings</span>
                    </div>
                  );
                })}
              </>
            ) : (
              <p className="stats-hint">
                An average and distribution appear after at least five valid
                ratings. Small samples are not presented as a quality claim.
              </p>
            )}
          </section>
        </div>
        <section className="stats-method" id="methodology">
          <p className="eyebrow">WHAT THE NUMBERS ACTUALLY MEAN</p>
          <h2>
            Clear definitions.
            <br />
            Honest limitations.
          </h2>
          <h3>Completed calls</h3>
          <p>
            Sessions marked completed with a recorded duration greater than
            zero. Active calls and cancelled sessions are excluded. A completed
            session is counted once, not once for each participant.
          </p>
          <h3>Hours of conversation</h3>
          <p>
            The sum of completed session durations divided by 3,600. A 15-minute
            conversation contributes 0.25 hours, even though two people
            participate. These are session hours, not doubled participant hours.
          </p>
          <h3>Learners who have practiced</h3>
          <p>
            Distinct accounts that participated in at least one qualifying
            completed call. This is different from registered accounts, daily
            active users, and the number of people currently online.
          </p>
          <h3>Ratings and monthly trends</h3>
          <p>
            Ratings are voluntary and may not represent every learner. Only
            valid 1–5 ratings from participants in qualifying calls are
            included; duplicate ratings by the same participant for a session
            are reduced to the latest entry. Negative ratings remain in the
            calculation. Each participant may rate a call, so the rating count
            is not a count of rated sessions.
          </p>
          <p>
            Monthly activity uses the session end date in UTC, or its creation
            date if an end date was not recorded. The current month is
            incomplete. Figures describe activity, not improvement in IELTS
            scores.
          </p>
          <h3>Privacy and data availability</h3>
          <p>
            Only aggregates are published. No aliases, Telegram IDs, recordings,
            private feedback, reports, or payment information appear here.
            Totals reflect recorded platform activity and may include internal
            test sessions. These figures have not been independently audited.
          </p>
          {data && (
            <p>
              Currently available: {number(data.activeTopics)} active speaking
              topics with active questions.
            </p>
          )}
          <p>
            If the data source is unavailable, the page says so. A cached
            snapshot can be older than the newest session; check its timestamp
            above.
          </p>
        </section>
      </div>
    </>
  );
}

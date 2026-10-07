export function Brand() {
  return (
    <div className="brand" aria-label="PairTalk">
      <img
        src={`${import.meta.env.BASE_URL}brand-mark.svg`}
        alt=""
        width="40"
        height="40"
      />
      <span>
        pairtalk<span className="brand-dot">.</span>
      </span>
    </div>
  );
}

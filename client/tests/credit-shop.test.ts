import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { CreditCalculator } from "../../platform/CreditCalculator";
import {
  sellingCreditRates,
  defaultCreditCosts,
  quoteCredits,
  type CreditCatalog,
} from "../../server/src/contracts/credits";
const catalog: CreditCatalog = {
  version: 1,
  revision: "a".repeat(64),
  checkedAt: "2026-10-15T12:00:00Z",
  minutes: 15,
  storageDays: 30,
  starterCalls: 3,
  markupPercent: 12,
  salesEnabled: true,
  recordingsAvailable: 3,
  rates: sellingCreditRates(defaultCreditCosts),
  uzsPerUsd: defaultCreditCosts.uzsPerUsd,
  usdPerStar: defaultCreditCosts.usdPerStar,
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const change = async (element: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
it("shows separate UZS rates, optional recordings and the rounded basket total", async () => {
  await act(async () =>
    root.render(
      createElement(CreditCalculator, { catalog, onCheckout: vi.fn() }),
    ),
  );
  for (const kind of ["CALL", "RECORDING"] as const)
    expect(host.textContent).toContain(catalog.rates[kind].uzs.toLocaleString("en-US", {maximumFractionDigits:2}));
  expect(host.textContent).toContain("UZS/call");
  expect(host.textContent).toContain("22 Stars/call");
  expect(host.textContent).toContain("28 Stars/recording");
  expect(host.textContent).not.toMatch(/\bcredits?\b/i);
  const quantity =
    host.querySelectorAll<HTMLInputElement>("input[type=number]");
  expect(quantity[0].value).toBe("5");
  expect(quantity[1].value).toBe("0");
  expect(
    host.querySelector<HTMLInputElement>("input[type=checkbox]")!.disabled,
  ).toBe(true);
  const total = quoteCredits(catalog, {
    calls: 5,
    recordings: 0,
    storage: false,
  });
  expect(host.textContent).toContain(`${total.stars} Telegram Stars`);
});
it("blocks recording purchases when stock changes but keeps call-only checkout available", async () => {
  const checkout = vi.fn();
  await act(async () => root.render(createElement(CreditCalculator, {catalog, onCheckout:checkout})));
  const recordings=host.querySelectorAll<HTMLInputElement>("input[type=number]")[1];
  await change(recordings,"1");
  await act(async () => host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1].click());
  await act(async () => root.render(createElement(CreditCalculator, {catalog:{...catalog, recordingsAvailable:0}, onCheckout:checkout})));
  const buy=host.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(buy.disabled).toBe(true);
  expect(host.textContent).toContain("temporarily sold out");
  expect(recordings.max).toBe("0");
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(checkout).not.toHaveBeenCalled();
  await change(recordings,"0");
  expect(buy.disabled).toBe(false);
  await act(async () => buy.click());
  expect(checkout).toHaveBeenCalledWith({calls:5,recordings:0,storage:false});
});
it("requires explicit terms acceptance before checkout and submits quantities independently", async () => {
  const checkout = vi.fn();
  await act(async () =>
    root.render(
      createElement(CreditCalculator, { catalog, onCheckout: checkout }),
    ),
  );
  const buy = host.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(buy.disabled).toBe(true);
  await act(async () =>
    host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1].click(),
  );
  expect(buy.disabled).toBe(false);
  await act(async () => buy.click());
  expect(checkout).toHaveBeenCalledWith({
    calls: 5,
    recordings: 0,
    storage: false,
  });
});
it("permits recording-only purchases with storage and clears storage when recordings return to zero", async () => {
  const checkout = vi.fn();
  await act(async () =>
    root.render(
      createElement(CreditCalculator, { catalog, onCheckout: checkout }),
    ),
  );
  const fields = host.querySelectorAll<HTMLInputElement>("input[type=number]");
  await change(fields[0], "0");
  await change(fields[1], "3");
  const boxes = host.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
  await act(async () => {
    boxes[0].click();
    boxes[1].click();
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button[type=submit]")!.click(),
  );
  expect(checkout).toHaveBeenCalledWith({
    calls: 0,
    recordings: 3,
    storage: true,
  });
  await change(fields[1], "0");
  expect(boxes[0].checked).toBe(false);
  expect(
    host.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled,
  ).toBe(true);
});
it("keeps checkout disabled when sales are paused even with accepted terms", async () => {
  const checkout = vi.fn();
  await act(async () =>
    root.render(
      createElement(CreditCalculator, {
        catalog: { ...catalog, salesEnabled: false },
        onCheckout: checkout,
      }),
    ),
  );
  await act(async () =>
    host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1].click(),
  );
  expect(
    host.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled,
  ).toBe(true);
  expect(checkout).not.toHaveBeenCalled();
});

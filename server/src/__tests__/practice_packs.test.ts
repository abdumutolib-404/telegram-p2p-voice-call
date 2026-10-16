import { describe, expect, it } from "vitest";
import { baseServiceStars, defaultPracticePrices, quotePracticePack, validatePracticePack } from "../contracts/practicePacks";

describe("practice pack pricing contract", () => {
  it("corrects the example to a 25% markup and rounds each base service up", () => {
    expect(baseServiceStars(3500, defaultPracticePrices)).toBe(18);
    expect(baseServiceStars(4200, defaultPracticePrices)).toBe(21);
    expect(baseServiceStars(3500, {...defaultPracticePrices,starUzs:300})).toBe(15);
  });
  it("charges exactly twice the base rate for 30 minutes, including retained file size", () => {
    const quote=quotePracticePack({calls:1,recordings:1,retention:true,minutes:30});
    expect(quote).toMatchObject({callUnits:2,recordingUnits:2,retentionCount:1,retentionUnits:2,lines:{callUzs:7000,recordingUzs:8400,retentionUzs:6},uzs:15406,stars:79});
    expect(quotePracticePack({calls:1,recordings:0,retention:false,minutes:30})).toMatchObject({uzs:7000,stars:36});
  });
  it("keeps retention quantity identical to recordings and makes it optional", () => {
    expect(quotePracticePack({calls:4,recordings:3,retention:true,minutes:15})).toMatchObject({retentionCount:3,retentionUnits:3,lines:{retentionUzs:9}});
    expect(quotePracticePack({calls:4,recordings:3,retention:false,minutes:15})).toMatchObject({retentionCount:0,retentionUnits:0,lines:{retentionUzs:0}});
  });
  it("permits purchases over the old arbitrary maximum while preserving arithmetic safety", () => {
    expect(quotePracticePack({calls:10001,recordings:0,retention:false,minutes:15})).toMatchObject({uzs:35003500,stars:180018});
    expect(()=>quotePracticePack({calls:Number.MAX_SAFE_INTEGER,recordings:0,retention:false,minutes:30})).toThrow(/safely/);
  });
  it("applies a discount to the whole pack and supports a zero-payment freebie", () => {
    expect(quotePracticePack({calls:2,recordings:1,retention:true,minutes:15},defaultPracticePrices,20)).toMatchObject({originalUzs:11203,originalStars:58,uzs:8963,stars:47});
    expect(quotePracticePack({calls:2,recordings:1,retention:true,minutes:15},defaultPracticePrices,100)).toMatchObject({uzs:0,stars:0,free:true});
  });
  it.each([
    {calls:0,recordings:1,retention:false,minutes:15},
    {calls:1,recordings:2,retention:false,minutes:15},
    {calls:1,recordings:0,retention:true,minutes:15},
    {calls:1.5,recordings:1,retention:false,minutes:15},
    {calls:Infinity,recordings:0,retention:false,minutes:15},
    {calls:1,recordings:0,retention:false,minutes:60},
    {calls:1,recordings:0,retention:false,minutes:15,stars:1},
  ])("rejects invalid quantities, duration and injected prices %#", input=>expect(()=>validatePracticePack(input)).toThrow());
  it("lets the admin change base prices and Stars references without rounding drift", () => {
    const prices={...defaultPracticePrices,callUzs:4000,starUzs:250};
    expect(quotePracticePack({calls:3,recordings:0,retention:false,minutes:15},prices)).toMatchObject({uzs:12000,stars:60});
    expect(()=>quotePracticePack({calls:1,recordings:0,retention:false,minutes:15},{...prices,starMarkupPercent:28.29},28.29)).not.toThrow();
    expect(()=>quotePracticePack({calls:1,recordings:0,retention:false,minutes:15},prices,20.123)).toThrow();
  });
});

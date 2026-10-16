import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PracticeCalculator } from '../../platform/PracticeCalculator';
import { PracticeCheckout } from '../src/components/PracticeCheckout';
import { defaultPracticePrices, type PracticeCatalog } from '../../server/src/contracts/practicePacks';
const catalog:PracticeCatalog={version:2,revision:'a'.repeat(64),checkedAt:'2026-10-16T00:00:00Z',prices:defaultPracticePrices,durations:[15,30],retentionDays:30,starterCalls:3,salesEnabled:true,recordingMinutesAvailable:60};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function change(input:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function renderCalculator(){const checkout=vi.fn();await act(async()=>root.render(createElement(PracticeCalculator,{catalog,onCheckout:checkout})));return {checkout,inputs:host.querySelectorAll<HTMLInputElement>('input[type=number]'),button:host.querySelector<HTMLButtonElement>('button[type=submit]')!};}
it('accepts more than 1000 calls without a business quantity ceiling',async()=>{const {checkout,inputs,button}=await renderCalculator();await change(inputs[0],'1001');expect(inputs[0].max).toBe('');expect(button.disabled).toBe(false);await act(async()=>button.click());expect(checkout).toHaveBeenCalledWith({calls:1001,recordings:0,retention:false,minutes:15});});
it('blocks recordings greater than calls and invalid whole quantities',async()=>{const {inputs,button}=await renderCalculator();await change(inputs[0],'1');await change(inputs[1],'2');expect(button.disabled).toBe(true);expect(host.textContent).toContain('Recordings cannot exceed calls');await change(inputs[1],'0');await change(inputs[0],'1.5');expect(button.disabled).toBe(true);});
it('doubles the rounded service prices and adjusts recording capacity for 30 minutes',async()=>{const {inputs,button,checkout}=await renderCalculator();await act(async()=>{const duration=host.querySelector('select')!;duration.value='30';duration.dispatchEvent(new Event('change',{bubbles:true}));});expect(host.textContent).toContain('36 Stars/call');expect(host.textContent).toContain('42 Stars/recording');expect(host.textContent).toContain('7,000');await change(inputs[1],'2');expect(button.disabled).toBe(true);await change(inputs[1],'1');await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());expect(host.textContent).toContain('6 UZS per 30-minute recording');await act(async()=>button.click());expect(checkout).toHaveBeenCalledWith({calls:5,recordings:1,retention:true,minutes:30});});
it('requires review acceptance before either payment action',async()=>{
  const pay=vi.fn(),close=vi.fn();
  // jsdom does not implement the native dialog API; actual focus and dismissal
  // behavior is checked separately in Chrome.
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
  await act(async()=>root.render(createElement(PracticeCheckout,{catalog,pack:{calls:2,recordings:1,retention:true,minutes:15},busy:false,error:'',onClose:close,onPay:pay})));
  const dialog=document.querySelector('dialog')!;
  expect(dialog.textContent).toContain('11,203');expect(dialog.textContent).toContain('58');
  const buttons=dialog.querySelectorAll<HTMLButtonElement>('.practice-checkout__actions button');expect(buttons[0].disabled).toBe(true);expect(buttons[1].disabled).toBe(true);
  await act(async()=>dialog.querySelector<HTMLInputElement>('input')!.click());
  await act(async()=>buttons[0].click());expect(pay).toHaveBeenCalledWith('UZS');
  await act(async()=>buttons[1].click());expect(pay).toHaveBeenCalledWith('XTR');
});

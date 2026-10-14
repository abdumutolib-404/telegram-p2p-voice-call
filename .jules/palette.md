## 2025-05-18 - Popover API Feature Detection and Roving TabIndex

**Learning:** When using `popover="manual"` on floated/portal panels, environments without native Popover API support (such as JSDOM) treat elements with the `popover` attribute as closed popovers and block keyboard focus on child controls. Feature-detecting `typeof HTMLElement.prototype.showPopover === 'function'` before setting `popover="manual"` allows focus management to work seamlessly in all environments. Additionally, menu controls (`role="menu"`) require roving tabindex (`tabIndex={current === id ? 0 : -1}`) so focused/selected items are keyboard accessible.
**Action:** Always feature-detect `showPopover` when applying `popover="manual"` on portal panels, and ensure `role="menu"` items use roving `tabIndex`.

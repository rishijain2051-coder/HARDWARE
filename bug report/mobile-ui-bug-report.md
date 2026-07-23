# Mobile UI/UX Bug Report — HARDWARE (Vardhman ERP)
Repo audited: `rishijain2051-coder/HARDWARE` (Next.js + Tailwind, `app/(dashboard)`)
Method: static code review of layout, table, and form components (no live browser render available in this environment — recommend a manual pass on a real phone to confirm visually).

Fixes for items 1 and 2 have already been applied and are included in `mobile-ui-fixes.patch`.

---

## 1. CRITICAL — Report/detail tables clip content on mobile instead of scrolling
**Where:** `reports/low-stock`, `reports/supplier-wise`, `reports/purchase-history`, `reports/stock-summary`, `reports/category-stock`, `inventory/grn/[id]`, `inventory/mis/[id]` (7 files)

Each of these hand-rolls a `<table>` wrapped in a `<div className="rounded-lg border bg-card overflow-hidden">`. On a phone-width viewport, a 6–7 column table can't fit, and `overflow-hidden` **clips the extra columns instead of letting you scroll to them** — so on mobile you silently lose data like "Deficit" or "Status" with no way to see it.

Every other table in the app (the shared `DataTable` component used in Masters, Users, Audit Log, etc.) already does this correctly with `overflow-x-auto`. These 7 pages just missed it.

**Fix applied:** changed `overflow-hidden` → `overflow-x-auto` in all 7 files, matching the pattern already used everywhere else.

---

## 2. HIGH — Forms cram 2–4 columns into a narrow phone screen
**Where:** 10 files, 14 occurrences — GRN/MIS create & detail pages, and the Products/Units/Staff/Attributes/Suppliers/Users master forms (mostly inside modals via `components/ui/dialog.tsx`).

These forms use fixed `grid grid-cols-2` / `grid-cols-3` / `grid-cols-4` with no responsive breakpoint. The dialog itself does shrink to fit a phone (`w-full max-w-lg`), but inside it, 2–4 form fields per row on a ~340px-wide sheet leaves each input around 100–150px wide — labels wrap, numeric inputs get squeezed, and it's easy to mis-tap the wrong field.

**Fix applied:** changed every instance to `grid-cols-1 sm:grid-cols-N` — fields stack to one per row on mobile and expand back to the original layout at the `sm` breakpoint (≥640px) and up. Desktop/tablet appearance is unchanged.

---

## 3. MEDIUM — Search is completely inaccessible on mobile
**Where:** `app/(dashboard)/client-layout.tsx`, `TopBar` component

The product/SKU/supplier search bar is wrapped in `hidden lg:flex` — on any screen under the `lg` breakpoint it doesn't just get smaller, it's **not rendered at all**, and there was no alternative entry point. Staff using the ERP from a phone had no way to search inventory.

**Fix applied:** added a search icon button in the mobile top bar that expands into a full-width search input (with a close button), so the feature is reachable on phones instead of desktop-only.

---

## 4. MINOR (recommendation, not yet patched) — Row action icons are under the touch-target minimum
**Where:** `components/ui/button.tsx` (`size: "sm"` → `h-8`, icon-only usage), used for Edit/Delete actions in most Masters table rows (Products, Categories, Suppliers, Staff, Units, Bins, Attributes, Users).

The Edit (pencil) and Delete (trash) buttons in table rows are `size="sm"` (32px tall) holding a 16px icon, sitting only 8px apart (`space-x-2`). Apple/Google/WCAG guidance recommends ~44×44px minimum tap targets — at 32px with a tight neighbor, mis-taps (especially hitting Delete instead of Edit) are a real risk on a phone.

**Not patched** because bumping the shared `Button` "sm" size would also change desktop table density app-wide — this is a design call rather than a pure bug fix. Options worth considering: bump these two buttons to `size="icon"` (36px, still tight) or a custom `h-10 w-10` only for row actions, or move Delete behind a confirmation menu so it's not sitting directly next to Edit.

---

## Files changed (patch attached)
```
app/(dashboard)/client-layout.tsx
app/(dashboard)/inventory/grn/[id]/page.tsx
app/(dashboard)/inventory/grn/create/client.tsx
app/(dashboard)/inventory/mis/[id]/page.tsx
app/(dashboard)/inventory/mis/create/client.tsx
app/(dashboard)/masters/attributes/client.tsx
app/(dashboard)/masters/products/components/product-form.tsx
app/(dashboard)/masters/staff/client.tsx
app/(dashboard)/masters/suppliers/client.tsx
app/(dashboard)/masters/units/client.tsx
app/(dashboard)/reports/category-stock/page.tsx
app/(dashboard)/reports/low-stock/page.tsx
app/(dashboard)/reports/purchase-history/page.tsx
app/(dashboard)/reports/stock-summary/page.tsx
app/(dashboard)/reports/supplier-wise/page.tsx
app/(dashboard)/users/client.tsx
```

**To apply:** from your repo root, `git apply mobile-ui-fixes.patch` (or copy the diffs in manually — they're small, targeted one-line-per-spot changes). I wasn't able to run `npm run dev` / `npm run build` in this environment (no `node_modules`, offline sandbox), so please do a quick `npm run build` and a phone-width check in your browser devtools before merging.

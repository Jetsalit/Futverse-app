import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import {
  FutVerseThaiDateInput,
  FutVerseThaiDateTimeInput,
  FutVerseThaiTimeInput,
} from "../src/components/common/FutVerseThaiDateTimeInputs";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

async function mountInDom(element: React.ReactElement) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost",
  });
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  await act(async () => root.render(element));

  return {
    document: dom.window.document,
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

test("Thai date input shows Buddhist Era text and keeps the hidden form value canonical", () => {
  const html = render(React.createElement(FutVerseThaiDateInput, {
    id: "session-date",
    name: "sessionDate",
    value: "2026-09-26",
    onChange: () => {},
    required: true,
  }));
  const document = new JSDOM(html).window.document;
  const trigger = document.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']");
  assert.equal(trigger?.textContent?.replace(/\s+/g, " ").trim(), "26 กันยายน 2569");
  assert.equal(trigger?.getAttribute("aria-required"), "true");
  assert.equal(document.querySelector<HTMLInputElement>('input[type="text"][required]')?.required, true);
  assert.equal(document.querySelector<HTMLInputElement>('input[type="hidden"][name="sessionDate"]')?.value, "2026-09-26");
  assert.doesNotMatch(trigger?.textContent ?? "", /2026|AM|PM/);
});

test("Thai date calendar selects a Gregorian date without changing its canonical value", async () => {
  let changed = "";
  const mounted = await mountInDom(React.createElement(FutVerseThaiDateInput, {
    value: "2026-09-26",
    onChange: (value: string) => { changed = value; },
  }));
  try {
    const trigger = mounted.document.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']");
    assert.ok(trigger);
    await act(async () => trigger.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    assert.match(mounted.document.body.textContent ?? "", /กันยายน 2569/);
    assert.match(mounted.document.body.textContent ?? "", /อาทิตย์/);
    const previousMonth = mounted.document.querySelector<HTMLButtonElement>('button[aria-label="เดือนก่อนหน้า"]');
    const nextMonth = mounted.document.querySelector<HTMLButtonElement>('button[aria-label="เดือนถัดไป"]');
    assert.ok(previousMonth);
    assert.ok(nextMonth);
    await act(async () => previousMonth.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    assert.match(mounted.document.body.textContent ?? "", /สิงหาคม 2569/);
    await act(async () => nextMonth.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    assert.match(mounted.document.body.textContent ?? "", /กันยายน 2569/);
    const nextDay = mounted.document.querySelector<HTMLButtonElement>('button[data-date="2026-09-27"]');
    assert.ok(nextDay);
    await act(async () => nextDay.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    assert.equal(changed, "2026-09-27");
  } finally {
    await mounted.close();
  }
});

test("Thai date input preserves leap day and disables dates outside supplied bounds", async () => {
  let changed = "";
  const mounted = await mountInDom(React.createElement(FutVerseThaiDateInput, {
    value: "2028-02-28",
    min: "2028-02-29",
    max: "2028-03-01",
    onChange: (value: string) => { changed = value; },
  }));
  try {
    const trigger = mounted.document.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']");
    assert.ok(trigger);
    await act(async () => trigger.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    assert.equal(mounted.document.querySelector<HTMLButtonElement>('button[data-date="2028-02-28"]')?.disabled, true);
    const leapDay = mounted.document.querySelector<HTMLButtonElement>('button[data-date="2028-02-29"]');
    assert.equal(leapDay?.disabled, false);
    assert.match(leapDay?.getAttribute("aria-label") ?? "", /29 กุมภาพันธ์ 2571/);
    await act(async () => leapDay?.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    assert.equal(changed, "2028-02-29");
  } finally {
    await mounted.close();
  }
});

test("invalid date input fails closed without exposing or emitting a noncanonical value", () => {
  const html = render(React.createElement(FutVerseThaiDateInput, {
    value: "2026-02-30",
    onChange: () => assert.fail("invalid input must not emit a date"),
  }));
  const document = new JSDOM(html).window.document;
  const trigger = document.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']");
  assert.equal(trigger?.getAttribute("aria-invalid"), "true");
  assert.match(trigger?.textContent ?? "", /เลือกวันที่/);
  assert.equal(document.querySelector<HTMLInputElement>("input.sr-only")?.value, "");
});

test("disabled Thai date input cannot open its calendar or submit a named value", () => {
  const document = new JSDOM(render(React.createElement(FutVerseThaiDateInput, {
    name: "sessionDate",
    value: "2026-09-26",
    onChange: () => {},
    disabled: true,
  }))).window.document;
  assert.equal(document.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']")?.disabled, true);
  assert.equal(document.querySelector<HTMLInputElement>('input[type="hidden"][name="sessionDate"]')?.disabled, true);
});

test("Thai time input keeps 24-hour canonical values and renders the Thai time suffix", () => {
  for (const value of ["00:00", "09:00", "17:30", "23:59"]) {
    const document = new JSDOM(render(React.createElement(FutVerseThaiTimeInput, {
      value,
      onChange: () => {},
    }))).window.document;
    assert.equal(document.querySelector<HTMLInputElement>("input[type='text']")?.value, value);
    assert.equal(document.body.textContent?.trim(), "น.");
    assert.doesNotMatch(`${document.body.textContent} ${value}`, /\b(?:AM|PM)\b/i);
  }
});

test("invalid canonical time fails closed instead of showing a malformed value", () => {
  const document = new JSDOM(render(React.createElement(FutVerseThaiTimeInput, {
    value: "25:00",
    onChange: () => assert.fail("invalid time must not emit a value"),
  }))).window.document;
  const input = document.querySelector<HTMLInputElement>("input[type='text']");
  assert.equal(input?.value, "");
  assert.equal(input?.getAttribute("aria-invalid"), "true");
  assert.doesNotMatch(document.body.textContent ?? "", /25:00|AM|PM/);
});

test("Thai time input rejects invalid values and honors min, max, and step", async () => {
  let changed = "";
  const mounted = await mountInDom(React.createElement(FutVerseThaiTimeInput, {
    value: "09:00",
    min: "09:00",
    max: "10:00",
    step: 900,
    onChange: (value: string) => { changed = value; },
  }));
  try {
    const input = mounted.document.querySelector<HTMLInputElement>("input[type='text']");
    assert.ok(input);
    const setValue = async (value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(mounted.document.defaultView!.HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new mounted.document.defaultView!.Event("input", { bubbles: true }));
        input.dispatchEvent(new mounted.document.defaultView!.Event("change", { bubbles: true }));
      });
    };
    await setValue("25:00");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(changed, "");
    await setValue("09:07");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(changed, "");
    await setValue("10:15");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(changed, "");
    await setValue("09:15");
    assert.equal(input.getAttribute("aria-invalid"), null);
    assert.equal(changed, "09:15");
  } finally {
    await mounted.close();
  }
});

test("Thai datetime input round-trips local wall-clock values without timezone conversion", () => {
  const value = "2026-09-26T19:00";
  const document = new JSDOM(render(React.createElement(FutVerseThaiDateTimeInput, {
    id: "kickoff",
    name: "kickoffAt",
    value,
    onChange: () => {},
  }))).window.document;
  assert.match(document.body.textContent ?? "", /26 กันยายน 2569/);
  assert.equal(document.querySelector<HTMLInputElement>("input[type='text']")?.value, "19:00");
  assert.match(document.body.textContent ?? "", /เวลา\s*น\./);
  assert.equal(document.querySelector<HTMLInputElement>('input[type="hidden"][name="kickoffAt"]')?.value, value);
  assert.equal(document.querySelectorAll('input[type="date"], input[type="time"], input[type="datetime-local"]').length, 0);
});

test("Thai datetime date selection emits the unchanged local wall-clock contract", async () => {
  let changed = "";
  const mounted = await mountInDom(React.createElement(FutVerseThaiDateTimeInput, {
    value: "2026-09-26T19:00",
    onChange: (next: string) => { changed = next; },
  }));
  try {
    const dateTrigger = mounted.document.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']");
    assert.ok(dateTrigger);
    await act(async () => dateTrigger.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    const nextDay = mounted.document.querySelector<HTMLButtonElement>('button[data-date="2026-09-27"]');
    assert.ok(nextDay);
    await act(async () => nextDay.dispatchEvent(new mounted.document.defaultView!.MouseEvent("click", { bubbles: true })));
    assert.equal(changed, "2026-09-27T19:00");
  } finally {
    await mounted.close();
  }
});

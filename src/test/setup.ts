import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { fakeGetContext } from "./fakeCanvas";

// Testing Library auto-registers this only when Vitest globals are on. They are
// deliberately off (so tsconfig needs no vitest/globals types), which means
// without this the DOM accumulates across tests in a file and queries start
// finding several copies of the same control.
afterEach(cleanup);

// jsdom returns null from getContext without the native `canvas` package, and
// imageField.ts / studio.ts both throw on null. Patch the prototype once, before
// any test module loads (setupFiles run first). This is a direct assignment
// rather than a spy on purpose: it must persist for the whole run.
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  kind: string,
) {
  return fakeGetContext(this, kind);
} as HTMLCanvasElement["getContext"];

// jsdom's toDataURL throws without the native canvas package. This is not an
// encoder — it encodes the canvas dimensions, so a test can assert a thumbnail
// was actually sized rather than merely produced.
HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) {
  return `data:image/jpeg;base64,${btoa(`${this.width}x${this.height}`)}`;
} as HTMLCanvasElement["toDataURL"];

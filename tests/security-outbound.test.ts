import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { publicRequest, resolvePublicTarget } from "@/server/outbound-http";
afterEach(() => vi.resetAllMocks());
describe("SSRF transport", () => {
  it("blocks DNS results containing any private address", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(
      resolvePublicTarget(new URL("https://example.com")),
    ).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("pins DNS and refuses redirects instead of contacting metadata", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mocks.request.mockImplementation((_url, options, onResponse) => {
      const callback = vi.fn();
      options.lookup("example.com", {}, callback);
      expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (error: Error) => void;
      };
      req.destroy = (error) => {
        req.emit("error", error);
        req.emit("close");
      };
      req.end = () =>
        queueMicrotask(() => {
          const res = Object.assign(new EventEmitter(), {
            statusCode: 302,
            headers: { location: "http://169.254.169.254/" },
          });
          onResponse(res);
          res.emit("end");
          req.emit("close");
        });
      return req;
    });
    await expect(publicRequest("https://example.com")).rejects.toThrow(
      "redirect blocked",
    );
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("caps response bytes", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mocks.request.mockImplementation((_url, _options, onResponse) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (error: Error) => void;
      };
      req.destroy = (error) => {
        req.emit("error", error);
        req.emit("close");
      };
      req.end = () =>
        queueMicrotask(() => {
          const res = Object.assign(new EventEmitter(), { statusCode: 200 });
          onResponse(res);
          res.emit("data", Buffer.alloc(11));
        });
      return req;
    });
    await expect(
      publicRequest("https://example.com", { maxResponseBytes: 10 }),
    ).rejects.toThrow("response too large");
  });
});

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReadingMessage } from "./types";

export class PersistentQueue<T extends { messageId: string } = ReadingMessage> {
  private items: T[] = [];
  private loaded = false;
  private meta: Record<
    string,
    { added: number; attempts: number; next: number }
  > = {};
  private dead: { item: T; reason: string; at: number }[] = [];
  private dropped = 0;
  constructor(
    private readonly file = ".meterwerk-queue.json",
    private readonly limits = {
      maxItems: 10000,
      maxBytes: 32 * 1024 * 1024,
      maxAgeMs: 7 * 86400000,
      warningItems: 1000,
      maxAttempts: 50,
      quarantineItems: 500,
    },
  ) {
    if (Object.values(limits).some((n) => !Number.isSafeInteger(n) || n < 1))
      throw new Error("Invalid queue limits");
  }
  async load() {
    if (this.loaded) return;
    try {
      this.items = JSON.parse(await readFile(this.file, "utf8")) as T[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.items = [];
    }
    try {
      const state = JSON.parse(await readFile(`${this.file}.state`, "utf8"));
      this.meta = state.meta;
      this.dead = state.dead;
      this.dropped = state.dropped;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const item of this.items)
      this.meta[item.messageId] ??= { added: Date.now(), attempts: 0, next: 0 };
    this.loaded = true;
    this.expire();
    while (
      this.items.length > this.limits.maxItems ||
      this.bytes > this.limits.maxBytes
    )
      this.quarantine(this.items[0], "CAPACITY");
    await this.persist();
  }
  get size() {
    return this.items.length;
  }
  private get bytes() {
    return Buffer.byteLength(JSON.stringify(this.items));
  }
  get status() {
    return {
      queueSize: this.size,
      queueWarning:
        this.size >= this.limits.warningItems ||
        this.bytes >= this.limits.maxBytes * 0.8,
      quarantineSize: this.dead.length,
      queueDropped: this.dropped,
    };
  }
  private quarantine(item: T, reason: string) {
    this.items = this.items.filter((x) => x.messageId !== item.messageId);
    delete this.meta[item.messageId];
    if (!this.dead.some((x) => x.item.messageId === item.messageId))
      this.dead.push({ item, reason, at: Date.now() });
    while (
      this.dead.length > this.limits.quarantineItems ||
      Buffer.byteLength(JSON.stringify(this.dead)) > this.limits.maxBytes
    ) {
      this.dead.shift();
      this.dropped++;
    }
  }
  private expire() {
    for (const item of [...this.items])
      if (Date.now() - this.meta[item.messageId].added >= this.limits.maxAgeMs)
        this.quarantine(item, "EXPIRED");
    const retained = this.dead.filter(
      (x) => Date.now() - x.at < this.limits.maxAgeMs,
    );
    this.dropped += this.dead.length - retained.length;
    this.dead = retained;
  }
  async enqueue(item: T) {
    await this.load();
    this.expire();
    if (!this.items.some((x) => x.messageId === item.messageId)) {
      if (
        this.size >= this.limits.maxItems ||
        this.bytes + Buffer.byteLength(JSON.stringify(item)) + 1 >
          this.limits.maxBytes
      )
        this.quarantine(item, "CAPACITY");
      else {
        this.items.push(item);
        this.meta[item.messageId] = { added: Date.now(), attempts: 0, next: 0 };
      }
    }
    await this.persist();
  }
  async peek() {
    await this.load();
    return this.items[0];
  }
  async acknowledge(messageId: string) {
    await this.load();
    this.items = this.items.filter((x) => x.messageId !== messageId);
    delete this.meta[messageId];
    await this.persist();
  }
  async drain(send: (item: T) => Promise<void>) {
    await this.load();
    this.expire();
    for (const item of this.items.slice(0, 50)) {
      const state = this.meta[item.messageId];
      if (state.next > Date.now()) continue;
      try {
        await send(item);
        await this.acknowledge(item.messageId);
      } catch (error) {
        state.attempts++;
        state.next =
          Date.now() +
          Math.min(60000, 1000 * 2 ** Math.min(state.attempts - 1, 16));
        if (state.attempts >= this.limits.maxAttempts)
          this.quarantine(item, "RETRY_EXHAUSTED");
        await this.persist();
        throw error;
      }
    }
    await this.persist();
  }
  private async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(
      `${this.file}.state.tmp`,
      JSON.stringify({
        meta: this.meta,
        dead: this.dead,
        dropped: this.dropped,
      }),
    );
    await rename(`${this.file}.state.tmp`, `${this.file}.state`);
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.items, null, 2));
    await rename(tmp, this.file);
  }
}

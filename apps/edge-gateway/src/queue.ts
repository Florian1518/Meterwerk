import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReadingMessage } from "./types";

export class PersistentQueue<T extends { messageId: string } = ReadingMessage> {
  private items: T[] = [];
  private loaded = false;
  constructor(private readonly file = ".meterwerk-queue.json") {}
  async load() {
    if (this.loaded) return;
    try {
      this.items = JSON.parse(await readFile(this.file, "utf8")) as T[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.items = [];
    }
    this.loaded = true;
  }
  get size() {
    return this.items.length;
  }
  async enqueue(item: T) {
    await this.load();
    if (!this.items.some((x) => x.messageId === item.messageId))
      this.items.push(item);
    await this.persist();
  }
  async peek() {
    await this.load();
    return this.items[0];
  }
  async acknowledge(messageId: string) {
    await this.load();
    this.items = this.items.filter((x) => x.messageId !== messageId);
    await this.persist();
  }
  async drain(send: (item: T) => Promise<void>) {
    await this.load();
    for (const item of [...this.items]) {
      await send(item);
      await this.acknowledge(item.messageId);
    }
  }
  private async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.items, null, 2));
    await rename(tmp, this.file);
  }
}

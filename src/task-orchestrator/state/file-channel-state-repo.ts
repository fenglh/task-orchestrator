import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelState } from "../types/channel-state.ts";
import type { ChannelStateRepository } from "./channel-state-repo.ts";

export class FileChannelStateRepository implements ChannelStateRepository {
  private readonly baseDir: string;
  private readonly channelsDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.channelsDir = join(baseDir, "channels");
  }

  async get(channelConversationId: string): Promise<ChannelState | undefined> {
    await this.ensureDirs();
    try {
      const raw = await readFile(this.filePath(channelConversationId), "utf8");
      return JSON.parse(raw) as ChannelState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async save(channelState: ChannelState): Promise<void> {
    await this.ensureDirs();
    await writeFile(
      this.filePath(channelState.channelConversationId),
      JSON.stringify(channelState, null, 2),
    );
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.channelsDir, { recursive: true });
  }

  private filePath(channelConversationId: string): string {
    return join(this.channelsDir, `${channelConversationId}.json`);
  }
}

import { BaseAdapter } from "./base-adapter.js";

/** Mirrors the drill into the browser dashboard over WebSocket. */
export class WsAdapter extends BaseAdapter {
  constructor({ broadcast }) {
    super("dashboard");
    this.broadcast = broadcast;
  }

  async createChannel(name, topic) {
    this.channel = { id: `ws-${name}`, name };
    this.broadcast({ type: "channel", name, topic });
    return this.channel;
  }

  async send(message) {
    this.broadcast({ type: "message", message });
  }

  async addReaction(emoji) {
    this.broadcast({ type: "reaction", emoji });
  }

  /** Called by the server when a dashboard client sends chat. */
  pushUser({ name, text }) {
    this._deliverUser({ userId: "dashboard", name: name || "You", text });
  }
}

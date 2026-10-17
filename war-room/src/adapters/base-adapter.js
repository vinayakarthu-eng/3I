/**
 * Platform-independent messaging surface. Agents only ever talk to this interface,
 * so adding Teams/Discord means writing one new adapter — nothing in agents/ changes.
 *
 * A `message` is: { role, name, emoji, color, text, kind, severity, meta }
 *   kind: "agent" | "user" | "inject" | "system"
 */
export class BaseAdapter {
  constructor(name) {
    this.name = name;
    this.channel = null;
    this._userHandler = null;
  }

  /** Register a handler for inbound human messages: (user, sourceAdapter) => void */
  onUserMessage(handler) {
    this._userHandler = handler;
  }

  _deliverUser(user) {
    this._userHandler?.(user, this);
  }

  // Subclasses override these.
  async start() {}
  async stop() {}
  async createChannel(_name, _topic) {}
  async send(_message) {}
  async addReaction(_emoji) {}
  /** The incident closed (after-action posted). */
  async closeChannel() {}
}

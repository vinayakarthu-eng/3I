import boltPkg from "@slack/bolt";
import { BaseAdapter } from "./base-adapter.js";

const { App } = boltPkg;

/**
 * Real Slack integration over Socket Mode (no public URL). Creates the incident
 * channel, posts as the agents, and routes every human `message.channels` event
 * in that channel into the orchestrator.
 */
export class SlackAdapter extends BaseAdapter {
  constructor({ botToken, appToken, signingSecret, hooks }) {
    super("slack");
    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
      ...(signingSecret ? { signingSecret } : {}),
    });
    this.client = this.app.client;
    this.hooks = hooks; // { startDrill, sitrep, stopDrill }
    this.botUserId = null;
    this.lastTs = null;
    this.nameCache = new Map();
    this._wireEvents();
  }

  _wireEvents() {
    // Route real human messages in the active incident channel into the orchestrator.
    this.app.message(async ({ message }) => {
      if (!this.channel || message.channel !== this.channel.id) return;
      if (message.subtype || message.bot_id || message.user === this.botUserId) return;
      const name = await this._name(message.user);
      this._deliverUser({ userId: message.user, name, text: message.text || "" });
    });

    this.app.command("/drill", async ({ command, ack, respond }) => {
      await ack();
      const [slug, speed] = (command.text || "").trim().split(/\s+/);
      await this.hooks.startDrill({ slug, speed: Number(speed) || undefined, inviteUserId: command.user_id, respond });
    });
    this.app.command("/sitrep", async ({ ack }) => {
      await ack();
      await this.hooks.sitrep();
    });
    this.app.command("/drill-stop", async ({ ack, respond }) => {
      await ack();
      await this.hooks.stopDrill();
      await respond("Drill ended.");
    });
  }

  async start() {
    await this.app.start();
    const auth = await this.client.auth.test();
    this.botUserId = auth.user_id;
    return auth;
  }

  async stop() {
    await this.app.stop();
  }

  async createChannel(name, topic, { invite = [] } = {}) {
    const safe = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 78);
    const res = await this.client.conversations.create({ name: safe });
    this.channel = { id: res.channel.id, name: res.channel.name };
    if (topic) {
      await this.client.conversations.setTopic({ channel: this.channel.id, topic }).catch(() => {});
    }
    if (invite.length) {
      // force: invite everyone valid even if some ids are bad — and say which ones failed,
      // otherwise responders silently never see the channel.
      try {
        const res = await this.client.conversations.invite({ channel: this.channel.id, users: invite.join(","), force: true });
        for (const e of res.errors ?? []) console.warn(`[slack] couldn't invite ${e.user}: ${e.error}`);
      } catch (err) {
        const errors = err.data?.errors ?? [{ user: invite.join(","), error: err.data?.error ?? err.message }];
        for (const e of errors) if (e.error !== "already_in_channel") console.warn(`[slack] couldn't invite ${e.user}: ${e.error}`);
      }
    }
    return this.channel;
  }

  /** Member ids from `ids` that don't exist in this workspace (e.g. a SLACK_ONCALL typo). */
  async unknownUsers(ids) {
    const unknown = [];
    for (const id of ids) {
      try {
        const res = await this.client.users.info({ user: id });
        if (res.user?.deleted) unknown.push(`${id} (deactivated)`);
      } catch {
        unknown.push(id);
      }
    }
    return unknown;
  }

  async send(message) {
    if (!this.channel) return;
    const prefix = message.kind === "inject" ? "⚠️ *INJECT:* " : "";
    const who = message.kind === "user" ? "" : `${message.emoji} *${message.name}:* `;
    const res = await this.client.chat
      .postMessage({ channel: this.channel.id, text: `${prefix}${who}${message.text}` })
      .catch((e) => {
        console.error("Slack postMessage failed:", e.data?.error ?? e.message);
        return null;
      });
    if (res?.ts) this.lastTs = res.ts;
  }

  async addReaction(emoji) {
    if (!this.channel || !this.lastTs) return;
    await this.client.reactions
      .add({ channel: this.channel.id, timestamp: this.lastTs, name: emoji })
      .catch(() => {});
  }

  async _name(userId) {
    if (!userId) return "someone";
    if (this.nameCache.has(userId)) return this.nameCache.get(userId);
    try {
      const res = await this.client.users.info({ user: userId });
      const name = res.user?.profile?.display_name || res.user?.real_name || res.user?.name || "someone";
      this.nameCache.set(userId, name);
      return name;
    } catch {
      return "someone";
    }
  }
}

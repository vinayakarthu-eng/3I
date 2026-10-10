// Fires a scenario's timed injects at `atMin` (scaled by drill speed) and hands each
// to a callback. Applies any service-health changes the inject declares.

export class InjectEngine {
  constructor(scenario, speed, { onInject }) {
    this.scenario = scenario;
    this.speed = Math.max(1, speed || 1);
    this.onInject = onInject;
    this.timers = [];
  }

  start() {
    for (const inject of this.scenario.injects) {
      const delayMs = (inject.atMin * 60_000) / this.speed;
      this.timers.push(setTimeout(() => this.fire(inject), delayMs));
    }
  }

  fire(inject) {
    this.onInject(inject);
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

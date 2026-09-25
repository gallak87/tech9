import { Vector3 } from 'three';
import { Mission, RELAYS, SPAWN } from './mission.js';
import { FieldEquipment } from './FieldEquipment.js';
import { FieldAudio } from './FieldAudio.js';
import { GameUI } from './GameUI.js';

/** Game layer owns mission/presentation; SceneApp retains renderer and frame loop. */
export class AlderGame {
  id = 'alder-signal-mission';
  constructor({ controller, setSettings }) {
    this.controller = controller;
    this.setSettings = setSettings;
    this.mission = new Mission();
    this.notice = '';
    this.noticeUntil = 0;
  }
  init(context) {
    this.context = context;
    this.audio = new FieldAudio();
    this.equipment = new FieldEquipment(context.scene);
    this.ui = new GameUI(context.ui, {
      start: () => this.start(),
      restart: () => this.start(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      mute: () => {
        this.audio.toggleMute();
        this.renderUI();
      },
      settings: this.setSettings,
    });
    this.resetCamera();
    this.renderUI();
  }
  resetCamera() {
    const camera = this.context.camera;
    camera.position.fromArray(SPAWN);
    camera.lookAt(
      new Vector3(RELAYS[0].position[0], SPAWN[1] - 0.1, RELAYS[0].position[2]),
    );
    camera.updateMatrixWorld();
    this.controller.resetMotion();
  }
  start() {
    const now = performance.now() / 1000;
    this.mission.reset('playing', now);
    this.resetCamera();
    this.controller.setEnabled(true);
    this.controller.lock();
    this.audio.start();
    this.audio.cue('start');
    this.showNotice('Radio window open. Follow the amber markers.', now);
    this.emit();
    this.renderUI();
  }
  pause(reason = 'Mission paused') {
    const before = this.mission.state;
    this.mission.pause(performance.now() / 1000, reason);
    if (before !== this.mission.state) {
      this.controller.setEnabled(false);
      this.audio?.setActive(false);
      if (this.mission.state === 'lost') this.audio?.cue('lost');
      this.emit();
      this.renderUI();
    }
  }
  resume() {
    if (this.mission.state !== 'paused') return;
    this.mission.resume(performance.now() / 1000);
    this.controller.setEnabled(true);
    this.controller.lock();
    this.audio.start();
    this.emit();
    this.renderUI();
  }
  showNotice(text, now) {
    this.notice = text;
    this.noticeUntil = now + 4;
  }
  update(_dt, now) {
    const outcome = this.mission.tick(
      now,
      this.context.camera.position.toArray(),
      this.controller.keys.has('KeyE'),
    );
    if (outcome) {
      this.audio.cue(outcome);
      if (outcome === 'restored') {
        const target = this.mission.target;
        this.showNotice(
          target.id === 'base'
            ? 'All relays online. Return to the trailhead radio.'
            : `Uplink restored. Continue to ${target.label.toLowerCase()}.`,
          now,
        );
      } else {
        this.controller.setEnabled(false);
        this.audio.setActive(false);
        this.notice = '';
      }
      this.emit();
    }
    if (now > this.noticeUntil) this.notice = '';
    this.audio.update(
      now,
      this.controller.speed,
      this.mission.interactionProgress > 0,
    );
    this.equipment.update(this.snapshot(), now);
    this.renderUI();
  }
  emit() {
    this.context.events.dispatchEvent(
      new CustomEvent('missionchange', { detail: this.snapshot() }),
    );
  }
  renderUI() {
    if (this.ui)
      this.ui.update(
        this.snapshot(),
        this.context.camera,
        this.audio.snapshot(),
        this.controller.snapshot(),
        this.notice,
      );
  }
  configure(settings) {
    this.ui?.configure(settings);
  }
  snapshot() {
    return {
      ...this.mission.snapshot(
        this.context?.camera.position.toArray() ?? SPAWN,
      ),
      audio: this.audio?.snapshot(),
      controller: this.controller.snapshot(),
    };
  }
  dispose() {
    this.ui?.dispose();
    this.equipment?.dispose();
    this.audio?.dispose();
  }
}

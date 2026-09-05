import { ARRIVAL_INTERVAL, BUILDABLE_TYPES, BUILDINGS, DAY_LENGTH, getBuildingStats, MAX_POPULATION, RESOURCE_NAMES } from './game/config.ts'
import { canAfford, getEconomy, getObjectives, getUpgradeInfo } from './game/simulation.ts'
import type { BuildableType, Building, BuildingType, GameState, Objective, Resource } from './game/types.ts'

export interface UIOptions {
  hasSave: boolean
  loadError?: string
  savingAvailable?: boolean
}

export interface UICallbacks {
  onStart(): void
  onBuildSelect(type: BuildableType | null): void
  onBuildToggle(): void
  onPlace(): void
  onRotate(): void
  onGather(held: boolean): void
  onWorker(buildingId: string, change: 1 | -1): void
  onUpgrade(buildingId: string): void
  onDemolish(buildingId: string): void
  onPauseToggle(): void
  onSoundToggle(): void
  onOverviewToggle(): void
  onSettlementToggle(): void
  onSave(): void
  onReset(): void
  onMove(x: number, y: number): void
  onJump(): void
}

export interface InteractionPrompt {
  title: string
  detail: string
  key: string
}

const RESOURCES: Resource[] = ['wood', 'stone', 'food']
const ICONS = {
  wood: '<path d="m5 8 10-4 5 4v9l-10 4-5-4Z"/><path d="m5 8 5 4 10-4M10 12v9M8 7l5 4"/><ellipse cx="15" cy="15" rx="2" ry="3"/>',
  stone: '<path d="m3 15 4-9 8-3 6 8-3 9H8Z"/><path d="m7 6 5 7 9-2M3 15l9-2 6 7M12 13l3-10"/>',
  food: '<path d="M12 8C7 4 3 8 4 13c1 5 5 8 8 7 3 1 7-2 8-7 1-5-3-9-8-5Z"/><path d="M12 8V4m0 2c0-3 3-4 6-3-1 3-3 4-6 3M7 11v2"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  heart: '<path d="M12 20 4 12C-1 6 7 0 12 7 17 0 25 6 20 12Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  sound: '<path d="M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-5 4H3v8h3l5 4Zm5 5 6 6m0-6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  leaf: '<path d="M20 3C8 1 2 8 5 15s16 5 15-12Z"/><path d="M4 21 16 8m-6 6-1-5m1 5h5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  hand: '<path d="M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v10c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  hammer: '<path d="m14 4 6 6-3 3-3-3-9 10-3-3 10-9-3-3 3-3Z"/>',
  rotate: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  jump: '<path d="M5 20h14M12 16V3m-5 5 5-5 5 5"/>',
  save: '<path d="M4 3h13l4 4v14H3V3Zm3 0v6h9V3M7 21v-8h10v8"/>',
  flag: '<path d="M5 22V3m0 1c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  home: '<path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-8h6v8"/>',
  warning: '<path d="m12 3 10 18H2ZM12 9v5m0 3v.5"/>',
} satisfies Record<string, string>

function icon(name: keyof typeof ICONS, extraClass = ''): string {
  return `<svg class="ui-icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <rect x="2" y="2" width="60" height="60" rx="22" fill="#244D3C"/>
  <circle cx="43" cy="20" r="7" fill="#E5BA62"/>
  <path d="M12 44 25 23l13 21Z" fill="#C4D6A1"/><path d="m25 23 5 21h8Z" fill="#86AC7C"/>
  <path d="m26 47 16-19 13 19Z" fill="#78A982"/><path d="m42 28 2 19h11Z" fill="#4D8565"/>
  <path d="M12 45c12-5 27 8 42 0" stroke="#F5EAD1" stroke-width="3" stroke-linecap="round"/>
  <path d="M19 49c8-1 15 4 25 1" stroke="#E9C47A" stroke-width="2" stroke-linecap="round"/>
</svg>`

const BUILDING_ART: Record<BuildingType, string> = {
  cottage: `<ellipse cx="56" cy="69" rx="43" ry="11" fill="#DCE4C6"/><path d="m29 41 29-13 27 14v25L58 78 29 63Z" fill="#F7E9C7"/><path d="m58 53 27-11v25L58 78Z" fill="#E6CAA0"/><path d="m23 42 27-25 40 23-32 15Z" fill="#D97E60"/><path d="m23 42 27-25 8 38Z" fill="#F0AA7E"/><path d="m50 17 16 6 24 17-32 15Z" fill="#C96853"/><path d="m37 48 11 5v17l-11-5Z" fill="#557B64"/><path d="m66 54 11-5v10l-11 5Z" fill="#678B78"/><path d="m71 52 1 10m-6-3 11-5" stroke="#F6DC9B" stroke-width="1.8"/><path d="m72 22 6-3 5 3v13l-6 3-5-4Z" fill="#F0DDB7"/><path d="m72 22 6 3 5-3-5-3Z" fill="#A77D65"/><circle cx="24" cy="63" r="7" fill="#81A566"/><circle cx="20" cy="67" r="5" fill="#A0BD7E"/><path d="m46 70 11 6-5 4-12-6Z" fill="#C3AD8A"/>`,
  garden: `<ellipse cx="55" cy="69" rx="43" ry="10" fill="#DCE4C6"/><path d="m17 47 44-22 36 21-43 26Z" fill="#AA7956"/><path d="m17 47 37 25v7L17 55Zm37 25 43-26v8L54 79Z" fill="#C49C6B"/><path d="m24 48 36-18 28 16-34 21Z" fill="#6B6344"/><path d="m37 40 28 20m-16-26 27 19" stroke="#D9B680" stroke-width="3"/><path d="m29 47 8 4m6-11 8 4m5-12 8 4m-21 21 8 4m6-11 8 4m4-13 8 4" stroke="#E6A257" stroke-width="5" stroke-linecap="round"/><g fill="#79A15E"><path d="M29 49c-10-12 7-17 5-3 5-12 16-4 3 5Z"/><path d="M44 41c-8-13 9-15 5-3 6-9 14 0 1 5Z"/><path d="M58 33c-6-12 7-14 5-3 6-9 14-1 2 5Z"/><path d="M44 60c-9-12 7-16 5-3 5-12 15-3 2 5Z"/><path d="M58 51c-8-13 8-15 5-3 6-10 14-1 2 5Z"/><path d="M72 43c-7-12 8-15 5-3 6-9 13 0 2 5Z"/></g><g stroke="#D6DE97" stroke-width="1.4"><path d="m32 48-1-7m16-1-1-7m15 0v-8M47 59l-1-7m15-2v-7m14 0v-7"/></g>`,
  lumberyard: `<ellipse cx="55" cy="71" rx="45" ry="10" fill="#DCE4C6"/><path d="M79 56v15" stroke="#97704D" stroke-width="5"/><path d="m65 57 14-24 15 24Z" fill="#608C63"/><path d="m69 45 10-23 11 23Z" fill="#87AD73"/><path d="m23 44 27-14 24 14v24L48 80 23 66Z" fill="#D5AF76"/><path d="m48 56 26-12v24L48 80Z" fill="#B88755"/><path d="M29 49v16m13-9v18m13-19v19m12-25v19" stroke="#9C714A" stroke-width="3"/><path d="m16 43 26-25 37 23-31 16Z" fill="#618D75"/><path d="m16 43 26-25 6 39Z" fill="#8CAE82"/><path d="m42 18 6 39 31-16Z" fill="#3D725D"/><path d="m21 61 14-7 20 11-15 9Zm0 9 14-7 20 11-15 9Z" fill="#AC7647"/><g fill="#E7BF7E" stroke="#9E7148" stroke-width="1.5"><ellipse cx="25" cy="64" rx="5" ry="5.5"/><ellipse cx="33" cy="69" rx="5" ry="5.5"/><ellipse cx="23" cy="72" rx="5" ry="5.5"/><ellipse cx="32" cy="77" rx="5" ry="5.5"/></g><path d="m23 64 3 1m5 3 3 2m-13 1 3 2m7 4 3 1" stroke="#B38851" stroke-width="1.3"/>`,
  quarry: `<ellipse cx="55" cy="69" rx="44" ry="11" fill="#DCE4C6"/><path d="m22 62 8-23 21-15 18 9 13 24-20 16Z" fill="#A5B6AC"/><path d="m30 39 21-15 1 27-30 11Z" fill="#D5DCD1"/><path d="m51 24 18 9 13 24-30-6Z" fill="#BECABF"/><path d="m22 62 30-11 10 22Z" fill="#91A69E"/><path d="m52 51 30 6-20 16Z" fill="#78938A"/><path d="m27 65 13-5 11 8-13 8-13-4Z" fill="#DFE1D2"/><path d="m38 76 13-8v7l-12 7Z" fill="#ABBCAF"/><path d="m70 68 10-6 13 6-2 8-14 5-9-6Z" fill="#CDD4C6"/><path d="m80 62 3 11 10-5m-10 5-6 8" stroke="#93A99C" stroke-width="1.5"/><path d="m52 63 23-28" stroke="#BC915F" stroke-width="5" stroke-linecap="round"/><path d="m61 31 18 9 6 9-13-8-15-5Z" fill="#55766E"/><path d="m18 72 7-7 1 10" fill="#9AB373"/>`,
  hearth: `<ellipse cx="55" cy="69" rx="39" ry="10" fill="#E1DDC3"/><g fill="#A6B4A5"><ellipse cx="27" cy="61" rx="8" ry="5"/><ellipse cx="39" cy="71" rx="8" ry="5"/><ellipse cx="57" cy="74" rx="8" ry="5"/><ellipse cx="74" cy="68" rx="8" ry="5"/><ellipse cx="81" cy="57" rx="8" ry="5"/></g><path d="m32 59 37 12m-31-1 33-13" stroke="#9E714D" stroke-width="8" stroke-linecap="round"/><path d="M39 52c-1-11 15-15 13-34 16 9 14 22 17 29 9-5 12 7 5 15-9 10-34 7-35-10Z" fill="#DF885A"/><path d="M48 55c0-7 9-12 8-22 12 12 5 16 10 22 5 12-19 14-18 0Z" fill="#F4C96E"/>`,
}

function buildingArt(type: BuildingType): string {
  return `<svg class="building-art" viewBox="0 0 112 88" fill="none" aria-hidden="true">${BUILDING_ART[type]}</svg>`
}

function text(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value
}

function rate(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString(undefined, { maximumFractionDigits: 1 })}`
}

interface BuildingRow {
  element: HTMLElement
  type: BuildingType
  heading: HTMLHeadingElement
  production: HTMLElement
  level: HTMLElement
  upgrade: HTMLButtonElement
  upgradeBenefit: HTMLElement
  upgradeReason: HTMLElement
  upgradeCosts: Map<Resource, HTMLElement>
  workers: HTMLElement
  minus: HTMLButtonElement
  plus: HTMLButtonElement
}

export class GameUI {
  private readonly root: HTMLElement
  private readonly callbacks: UICallbacks
  private readonly welcome: HTMLElement
  private readonly game: HTMLElement
  private readonly pauseDialog: HTMLDialogElement
  private readonly toastStack: HTMLElement
  private readonly rows = new Map<string, BuildingRow>()
  private readonly objectiveRows = new Map<string, HTMLElement>()
  private readonly toastTimers = new Map<HTMLElement, number | undefined>()
  private feedbackTimer: number | undefined
  private readonly refs = new Map<string, HTMLElement>()
  private readonly lifecycle = new AbortController()
  private readonly layoutObserver: ResizeObserver
  private selectedBuild: BuildableType | null = null
  private interaction: InteractionPrompt | null = null
  private placementMessage: string | null = null
  private placementValid = false
  private started = false
  private paused = false
  private settlementOpen = false
  private fatal = false
  private joystickPointer: number | null = null
  private gatherPointer: number | null = null
  private gathering = false
  private priorFocus: HTMLElement | null = null
  private buildingStructure = ''
  private rowSequence = 0

  constructor(container: HTMLElement, callbacks: UICallbacks, options: UIOptions) {
    this.root = container
    this.callbacks = callbacks
    container.classList.add('frontier-ui', 'is-welcome', 'build-menu-open')
    container.innerHTML = `
      <section class="welcome" data-ui="welcome" aria-labelledby="welcome-title">
        <div class="welcome-brand">${BRAND_MARK}<span>Little Frontier</span></div>
        <div class="welcome-content">
          <h1 id="welcome-title">A little world.<br><em>A big beginning.</em></h1>
          <p class="welcome-description">Wander a living little planet. Gather what nature gives, build a place to belong, and help a handful of settlers feel at home.</p>
          <ul class="welcome-tags" aria-label="Explore, gather, and grow">
            <li>${icon('compass')}Explore</li><li>${icon('hand')}Gather</li><li>${icon('leaf')}Grow</li>
          </ul>
          <div class="welcome-error load-warning" data-ui="load-warning" role="alert" hidden></div>
          <div class="welcome-error fatal-error" data-ui="fatal-error" role="alert" tabindex="-1" hidden>
            ${icon('warning')}<div><strong>This world needs a little help.</strong><p data-ui="fatal-message"></p><p>Try a browser with WebGL enabled, then reload this page.</p></div>
          </div>
          <button class="button button-primary start-button" data-ui="start" type="button"><span data-ui="start-label">Begin your frontier</span>${icon('arrow')}</button>
          <p class="welcome-save">${icon('save')}<span data-ui="welcome-save-status">Autosaves on this device. Pick up where you left off.</span></p>
          <p class="welcome-controls desktop-hint"><kbd>WASD</kbd> wander <span>·</span> drag to look <span>·</span> hold <kbd>E</kbd> to gather</p>
          <p class="welcome-controls touch-hint">Drag to look. Use the joystick to wander.<br>Hold Gather when you find a resource.</p>
        </div>
        <p class="welcome-footnote">${icon('leaf')}A little care goes a long way.</p>
      </section>

      <div class="game-interface" data-ui="game" hidden>
        <header class="topbar" data-ui="topbar">
          <div class="hud-brand">${BRAND_MARK}<div><span class="brand-name">Little Frontier</span><span class="brand-subtitle">Meadowlands</span></div></div>
          <div class="hud-center">
            <div class="resource-strip" role="group" aria-label="Settlement resources">
              ${RESOURCES.map((resource) => `<div class="resource-pill resource-${resource}" data-ui="resource-${resource}">
                <span class="resource-symbol">${icon(resource)}</span><div class="resource-copy"><span class="resource-name">${RESOURCE_NAMES[resource]}</span><strong data-ui="${resource}-value">0</strong></div>
                <span class="resource-rate" data-ui="${resource}-rate">0<span>/min</span></span>
              </div>`).join('')}
            </div>
            <button class="settlement-toggle" data-ui="settlement-toggle" type="button" aria-label="Open settlement and manage workers" aria-expanded="false" aria-controls="settlement-panel" title="Settlement and workers (T)">
              ${icon('people')}<span><strong data-ui="population">3 / 3</strong><span class="settler-label">settlers</span></span>
              <span class="wellbeing">${icon('heart')}<span data-ui="wellbeing">80%</span></span>
            </button>
            <div class="day-badge" data-ui="day-badge"><span data-ui="day-icon">${icon('sun')}</span><span><strong data-ui="day-number">Day 1</strong><span data-ui="day-phase">Morning</span></span></div>
          </div>
          <nav class="top-actions" aria-label="Game settings">
            <button class="icon-button" data-ui="sound" type="button" aria-label="Turn sound on" aria-pressed="false" title="Turn sound on">${icon('muted')}</button>
            <button class="icon-button" data-ui="overview" type="button" aria-label="Planet overview" aria-pressed="false" title="Planet overview (V)">${icon('globe')}</button>
            <button class="icon-button" data-ui="pause" type="button" aria-label="Pause game" title="Pause game (Esc)">${icon('pause')}</button>
          </nav>
        </header>

        <section class="quest-panel paper-panel" aria-labelledby="quest-title">
          <div class="quest-heading"><h2 id="quest-title" data-ui="quest-title">A handful of possibilities</h2><span class="quest-count" data-ui="quest-count">0 / 5</span></div>
          <p class="quest-description" data-ui="quest-description">Gather 12 wood by hand from meadow trees.</p>
          <p class="quest-next-progress" data-ui="quest-next-progress"></p>
          <div class="quest-progress" data-ui="quest-progress" role="progressbar" aria-label="Completed milestones" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0"><i></i><i></i><i></i><i></i><i></i></div>
          <details class="quest-details"><summary>All milestones ${icon('chevron')}</summary><ol class="quest-list" data-ui="quest-list"></ol></details>
        </section>

        <div class="bottom-zone">
          <div class="context-area">
            <section class="placement-panel paper-panel" data-ui="placement" aria-label="Building placement" hidden>
              <div class="placement-heading"><span class="placement-symbol">${icon('hammer')}</span><strong data-ui="placement-name">Place a building</strong></div>
              <p class="placement-status" data-ui="placement-status" role="status">Choose a clear patch of land.</p>
              <div class="placement-actions">
                <button class="button button-primary" data-ui="place" type="button" disabled>${icon('check')}Place <kbd class="desktop-hint">E</kbd></button>
                <button class="button button-light" data-ui="rotate" type="button">${icon('rotate')}Rotate <kbd class="desktop-hint">R</kbd></button>
                <button class="button button-quiet" data-ui="cancel-build" type="button">Cancel <kbd class="desktop-hint">Esc</kbd></button>
              </div>
            </section>
            <div class="interaction-prompt" data-ui="interaction" role="status" hidden>
              <kbd class="interaction-key desktop-hint" data-ui="interaction-key">E</kbd><span class="touch-hint interaction-hand">${icon('hand')}</span>
              <div><strong data-ui="interaction-title"></strong><span data-ui="interaction-detail"></span></div>
            </div>
            <p class="explore-hint" data-ui="explore-hint">${icon('compass')}Walk up to a tree, stone, or berry bush to gather.</p>
          </div>
          <section class="build-dock paper-panel" data-ui="build-dock" aria-label="Construction">
            <div class="dock-header"><button class="dock-toggle" data-ui="build-toggle" type="button" aria-expanded="true" aria-controls="build-cards">${icon('hammer')}Build <kbd class="desktop-hint">B</kbd>${icon('chevron')}</button><span class="dock-context">Rates per worker</span></div>
            <div class="build-cards" id="build-cards" data-ui="build-cards">
              ${BUILDABLE_TYPES.map((type, index) => {
                const definition = BUILDINGS[type]
                const benefit = definition.beds ? `${definition.beds} beds` : `${rate(Math.max(...Object.values(definition.production)) * 60).replace('+', '')} ${RESOURCES.find((resource) => definition.production[resource] > 0)} / min`
                return `<button class="build-card" data-build="${type}" type="button" aria-pressed="false">
                  <kbd class="build-shortcut desktop-hint">${index + 1}</kbd><span class="build-selected-mark">${icon('check')}</span>
                  <span class="build-illustration">${buildingArt(type)}</span>
                  <strong>${definition.name}</strong><span class="build-benefit">${benefit}</span>
                  <span class="build-costs">${RESOURCES.filter((resource) => definition.cost[resource] > 0).map((resource) => `<span data-cost="${resource}" title="${RESOURCE_NAMES[resource]}">${icon(resource)}${definition.cost[resource]}</span>`).join('')}</span>
                </button>`
              }).join('')}
            </div>
          </section>
          <p class="desktop-controls desktop-hint"><span><kbd>WASD</kbd> move</span><span>drag to look</span><span><kbd>E</kbd> <span data-ui="keyboard-action">hold to gather</span></span><span><kbd>Space</kbd> jump</span></p>
        </div>

        <aside class="settlement-panel paper-panel" id="settlement-panel" data-ui="settlement" aria-labelledby="settlement-title" hidden>
          <header class="panel-heading"><h2 id="settlement-title">Your settlement</h2><button class="icon-button close-button" data-ui="close-settlement" type="button" aria-label="Close settlement" title="Close settlement">${icon('close')}</button><p class="worker-guidance" data-ui="settlement-feedback" role="status">Assign workers or improve your buildings.</p></header>
          <div class="settlement-summary"><div><strong data-ui="idle-workers">3</strong><span>idle workers</span></div><div><strong data-ui="housing">3 / 3</strong><span>settlers / beds</span></div><div><strong data-ui="food-net">−1.4</strong><span>food / min</span></div></div>
          <div class="arrival-card">
            <div class="arrival-heading">${icon('people')}<strong data-ui="arrival-title">A little room to grow</strong></div>
            <p data-ui="arrival-detail">Build a cottage to welcome a new neighbor.</p>
            <ul class="arrival-conditions" aria-label="Requirements for new settlers">
              <li data-ui="arrival-food">${icon('check')}<span>At least 8 food</span></li><li data-ui="arrival-morale">${icon('check')}<span>60% wellbeing</span></li><li data-ui="arrival-beds">${icon('check')}<span>A spare bed</span></li>
            </ul>
            <progress data-ui="arrival-progress" max="${ARRIVAL_INTERVAL}" value="0" aria-label="Time toward next settler arrival"></progress>
            <small>One arrival every ${ARRIVAL_INTERVAL}s while ready. Up to ${MAX_POPULATION} settlers.</small>
          </div>
          <div class="building-list-heading"><h3>Places & people</h3><span data-ui="building-count">1 place</span></div>
          <div class="building-list" data-ui="building-list"></div>
          <p class="settlement-footnote">Removing a building returns half its materials. Homes must have enough room for everyone.</p>
        </aside>

        <div class="touch-controls" data-ui="touch-controls" aria-label="Touch game controls">
          <div class="joystick-wrap"><div class="joystick-pad" data-ui="joystick" role="group" aria-label="Movement joystick. Drag in the direction you want to walk."><span class="joystick-cross"></span><span class="joystick-knob" data-ui="joystick-knob">${icon('compass')}</span></div><span class="touch-control-label">MOVE</span></div>
          <div class="touch-actions">
            <button class="touch-button touch-build" data-ui="touch-build" type="button" aria-label="Toggle build menu" aria-expanded="true" aria-controls="build-cards">${icon('hammer')}<span>Build</span></button>
            <button class="touch-button touch-jump" data-ui="jump" type="button">${icon('jump')}<span>Jump</span></button>
            <button class="touch-button touch-gather" data-ui="gather" type="button" aria-label="Hold to gather" aria-pressed="false">${icon('hand')}<span>Gather</span><small>HOLD</small></button>
          </div>
        </div>
        <div class="saving-status">${icon('save')}<span data-ui="saving-status">Autosaves on this device</span></div>
        <div class="overview-label" data-ui="overview-label" hidden>${icon('globe')}Planet overview <span class="desktop-hint">· V to return</span></div>
      </div>

      <dialog class="pause-dialog" data-ui="pause-dialog" aria-labelledby="pause-title" aria-describedby="pause-description">
        <h2 id="pause-title">Your frontier is paused.</h2><p id="pause-description">Your little world will wait right here.</p>
        <div class="pause-actions"><button class="button button-primary" data-ui="resume" type="button" autofocus>Resume ${icon('arrow')}</button><button class="button button-light" data-ui="save" type="button">${icon('save')}Save now</button></div>
        <p class="pause-save-status" data-ui="pause-save-status">Progress autosaves on this device.</p>
        <details class="help-details"><summary>How to feel at home ${icon('chevron')}</summary>
          <p>Gather by hand, build a cottage, then assign idle settlers to a garden. Keep at least 8 food and 60% wellbeing to welcome neighbors into spare beds.</p>
          <dl class="controls-list desktop-hint">
            <div><dt><kbd>WASD</kbd> / arrows</dt><dd>Wander</dd></div><div><dt><kbd>Shift</kbd></dt><dd>Run</dd></div>
            <div><dt>Drag / scroll</dt><dd>Look / zoom</dd></div><div><dt>Hold <kbd>E</kbd></dt><dd>Gather nearby</dd></div>
            <div><dt><kbd>Space</kbd></dt><dd>Jump</dd></div><div><dt><kbd>B</kbd> / <kbd>1</kbd>–<kbd>4</kbd></dt><dd>Build menu / select</dd></div>
            <div><dt><kbd>E</kbd> / <kbd>Q</kbd>, <kbd>R</kbd></dt><dd>Place / rotate</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Close current panel / pause</dd></div>
            <div><dt><kbd>T</kbd></dt><dd>Settlement & workers</dd></div><div><dt><kbd>V</kbd></dt><dd>Planet overview</dd></div>
          </dl>
          <p class="touch-hint">Drag the world to look around. Use the joystick to move, hold Gather near resources, and tap Build to make something new. Use Place and Rotate to position it.</p>
          <p class="help-note">There is no rush. Finish the five milestones, then keep making this world your own.</p>
        </details>
        <div class="pause-footer"><span>Ready for a different beginning?</span><button class="reset-button" data-ui="reset" type="button">Start fresh</button></div>
        <div data-ui="pause-toasts"></div>
      </dialog>
      <div class="toast-stack" data-ui="toasts" role="status" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div>
    `
    container.querySelectorAll<HTMLElement>('[data-ui]').forEach((element) => {
      this.refs.set(element.dataset.ui!, element)
    })
    this.welcome = this.ref('welcome')
    this.game = this.ref('game')
    this.pauseDialog = this.ref<HTMLDialogElement>('pause-dialog')
    this.toastStack = this.ref('toasts')
    this.layoutObserver = new ResizeObserver(() => this.updateLayoutBounds())
    this.layoutObserver.observe(this.ref('topbar'))
    this.layoutObserver.observe(this.ref('touch-controls'))
    text(this.ref('start-label'), options.hasSave ? 'Continue your frontier' : 'Begin your frontier')
    if (options.savingAvailable === false) text(this.ref('welcome-save-status'), 'Local saving is unavailable in this browser.')
    if (options.loadError) {
      text(this.ref('load-warning'), options.loadError)
      this.ref('load-warning').hidden = false
    }
    this.bindActions()
    this.bindTouch()
  }

  private ref<T extends HTMLElement = HTMLElement>(name: string): T {
    const element = this.refs.get(name)
    if (!element) throw new Error(`Missing interface element: ${name}`)
    return element as T
  }

  private updateLayoutBounds(): void {
    const root = this.root.getBoundingClientRect()
    const bounds = this.ref('topbar').getBoundingClientRect()
    if (bounds.height > 0) {
      const bottom = `${Math.ceil(bounds.bottom - root.top)}px`
      if (this.root.style.getPropertyValue('--hud-bottom') !== bottom) this.root.style.setProperty('--hud-bottom', bottom)
    }
    const controls = this.ref('touch-controls').getBoundingClientRect()
    if (controls.height > 0) {
      const bottom = `${Math.ceil(root.bottom - controls.top + 10)}px`
      if (this.root.style.getPropertyValue('--controls-bottom') !== bottom) this.root.style.setProperty('--controls-bottom', bottom)
    }
  }

  dispose(): void {
    this.lifecycle.abort()
    this.layoutObserver.disconnect()
    this.stopTouch()
    for (const timer of this.toastTimers.values()) window.clearTimeout(timer)
    window.clearTimeout(this.feedbackTimer)
    this.toastTimers.clear()
    if (this.pauseDialog.open) this.pauseDialog.close()
  }

  private bindActions(): void {
    const action = (name: string, callback: () => void) => {
      this.ref(name).addEventListener('click', callback)
    }
    action('start', () => { if (!this.fatal) this.callbacks.onStart() })
    action('build-toggle', () => this.callbacks.onBuildToggle())
    action('touch-build', () => this.callbacks.onBuildToggle())
    action('place', () => this.callbacks.onPlace())
    action('rotate', () => this.callbacks.onRotate())
    action('cancel-build', () => this.callbacks.onBuildSelect(null))
    action('settlement-toggle', () => this.callbacks.onSettlementToggle())
    action('close-settlement', () => this.callbacks.onSettlementToggle())
    action('sound', () => this.callbacks.onSoundToggle())
    action('overview', () => this.callbacks.onOverviewToggle())
    action('pause', () => this.callbacks.onPauseToggle())
    action('resume', () => this.callbacks.onPauseToggle())
    action('save', () => this.callbacks.onSave())
    action('reset', () => this.callbacks.onReset())
    action('jump', () => { if (this.canUseTouch()) this.callbacks.onJump() })
    this.root.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((button) => {
      const type = button.dataset.build as BuildableType
      button.title = BUILDINGS[type].description
      button.addEventListener('click', () => this.callbacks.onBuildSelect(this.selectedBuild === type ? null : type))
    })
    this.pauseDialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      if (this.paused) this.callbacks.onPauseToggle()
    })
    this.pauseDialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return
      const focusable = Array.from(this.pauseDialog.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (first && last && ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first))) {
        event.preventDefault()
        const next = event.shiftKey ? last : first
        next.focus()
      }
    })
  }

  showGame(): void {
    if (this.fatal) return
    this.started = true
    this.welcome.hidden = true
    this.game.hidden = false
    this.root.classList.remove('is-welcome')
    this.updateLayoutBounds()
  }

  update(state: GameState): void {
    const economy = getEconomy(state)
    for (const resource of RESOURCES) {
      const value = Math.floor(state.resources[resource])
      const perMinute = economy.rates[resource] * 60
      text(this.ref(`${resource}-value`), value >= 1000 ? value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 }) : value.toLocaleString())
      const rateElement = this.ref(`${resource}-rate`)
      const formatted = rate(perMinute)
      if (rateElement.dataset.value !== formatted) {
        rateElement.replaceChildren(document.createTextNode(formatted), Object.assign(document.createElement('span'), { textContent: '/min' }))
        rateElement.dataset.value = formatted
      }
      rateElement.classList.toggle('is-negative', perMinute < -0.049)
      this.ref(`resource-${resource}`).title = `${RESOURCE_NAMES[resource]}: ${value}. Net ${formatted} per minute${resource === 'food' ? ', after feeding settlers' : ''}.`
    }
    text(this.ref('population'), `${state.population} / ${economy.housing}`)
    text(this.ref('wellbeing'), `${Math.floor(state.wellbeing)}%`)
    this.ref('settlement-toggle').setAttribute('aria-label', `Settlement: ${state.population} settlers, ${economy.housing} beds. Wellbeing ${Math.floor(state.wellbeing)}%, ${economy.moraleLabel}. Manage workers.`)
    this.ref('settlement-toggle').title = `${economy.moraleLabel} · ${economy.idle} idle workers · Open settlement (T)`
    const phase = (state.time % DAY_LENGTH) / DAY_LENGTH
    const period = phase < 0.18 ? 'Morning' : phase < 0.3 ? 'Afternoon' : phase < 0.41 ? 'Dusk' : phase < 0.77 ? 'Night' : phase < 0.9 ? 'Dawn' : 'Morning'
    text(this.ref('day-number'), `Day ${Math.floor(state.time / DAY_LENGTH) + 1}`)
    text(this.ref('day-phase'), period)
    const dayIcon = this.ref('day-icon')
    const night = period === 'Night'
    if (dayIcon.dataset.night !== String(night)) {
      dayIcon.innerHTML = icon(night ? 'moon' : 'sun')
      dayIcon.dataset.night = String(night)
    }
    this.ref('day-badge').title = `A full day lasts ${DAY_LENGTH / 60} minutes.`
    this.root.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((button) => {
      const type = button.dataset.build as BuildableType
      const definition = BUILDINGS[type]
      const affordable = canAfford(state.resources, definition.cost)
      button.classList.toggle('is-unaffordable', !affordable)
      const costLabel = RESOURCES.filter((resource) => definition.cost[resource] > 0)
        .map((resource) => `${definition.cost[resource]} ${RESOURCE_NAMES[resource].toLowerCase()}`).join(', ')
      button.setAttribute('aria-label', `${definition.name}. ${costLabel}. ${affordable ? 'Materials ready.' : 'Gather more materials to build.'} ${definition.description}`)
      button.querySelectorAll<HTMLElement>('[data-cost]').forEach((cost) => {
        const resource = cost.dataset.cost as Resource
        const missing = Math.max(0, Math.ceil(definition.cost[resource] - state.resources[resource]))
        cost.classList.toggle('is-missing', missing > 0)
        cost.title = `${RESOURCE_NAMES[resource]}: ${definition.cost[resource]} needed${missing > 0 ? `, gather ${missing} more` : ', materials ready'}`
      })
    })
    this.updateObjectives(state)
    text(this.ref('idle-workers'), String(economy.idle))
    text(this.ref('housing'), `${state.population} / ${economy.housing}`)
    text(this.ref('food-net'), rate(economy.rates.food * 60))
    this.ref('food-net').classList.toggle('is-negative', economy.rates.food < 0)
    this.updateArrivals(state, economy.housing)
    this.updateBuildings(state, economy.idle)
  }

  private updateObjectives(state: GameState): void {
    const objectives = getObjectives(state)
    const completed = objectives.filter((objective) => objective.complete).length
    const next = objectives.find((objective) => !objective.complete)
    text(this.ref('quest-count'), `${completed} / ${objectives.length}`)
    text(this.ref('quest-title'), next?.title ?? 'This little world is yours.')
    text(this.ref('quest-description'), next?.description ?? 'Every milestone reached. Upgrade your hearth to unlock better homes and more productive workplaces, or keep exploring.')
    text(this.ref('quest-next-progress'), next ? this.objectiveProgress(next, state) : 'All milestones complete. Keep playing your way.')
    const progress = this.ref('quest-progress')
    progress.setAttribute('aria-valuenow', String(completed))
    progress.setAttribute('aria-valuemax', String(objectives.length))
    progress.setAttribute('aria-valuetext', `${completed} of ${objectives.length} milestones complete`)
    Array.from(progress.children).forEach((segment, index) => segment.classList.toggle('is-complete', index < completed))
    for (const objective of objectives) {
      let row = this.objectiveRows.get(objective.id)
      if (!row) {
        row = document.createElement('li')
        row.innerHTML = `<span class="objective-check">${icon('check')}</span><div><strong></strong><p></p><span class="sr-only"></span></div>`
        this.objectiveRows.set(objective.id, row)
        this.ref('quest-list').append(row)
      }
      row.classList.toggle('is-complete', objective.complete)
      text(row.querySelector('strong')!, objective.title)
      text(row.querySelector('p')!, objective.description)
      text(row.querySelector('.sr-only')!, objective.complete ? 'Completed' : 'Not yet complete')
    }
  }

  private objectiveProgress(objective: Objective, state: GameState): string {
    const staffed = (type: BuildableType) => state.buildings.some((building) => building.type === type && building.workers > 0)
    switch (objective.id) {
      case 'gather-wood': return `${Math.min(12, Math.floor(state.stats.gathered.wood))} / 12 wood gathered`
      case 'build-cottage': return `${Number(state.buildings.some((building) => building.type === 'cottage'))} / 1 cottage built`
      case 'staff-garden': return `${Number(staffed('garden'))} / 1 garden staffed`
      case 'staff-industry': return `${Number(staffed('lumberyard')) + Number(staffed('quarry'))} / 2 workplaces staffed`
      case 'grow-settlement': return `${Math.min(6, state.population)} / 6 settlers · ${Math.min(75, Math.floor(state.wellbeing))} / 75 wellbeing`
      default: return objective.complete ? 'Complete' : 'Your next little step'
    }
  }

  private updateArrivals(state: GameState, housing: number): void {
    const conditions = { food: state.resources.food >= 8, morale: state.wellbeing >= 60, beds: state.population < housing }
    for (const [condition, met] of Object.entries(conditions)) {
      const element = this.ref(`arrival-${condition}`)
      element.classList.toggle('is-met', met)
      element.setAttribute('aria-label', `${condition === 'food' ? 'At least 8 food' : condition === 'morale' ? 'At least 60% wellbeing' : 'A spare bed'}: ${met ? 'ready' : 'needed'}`)
    }
    const full = state.population >= MAX_POPULATION
    const ready = !full && Object.values(conditions).every(Boolean)
    const remaining = Math.max(0, Math.ceil(ARRIVAL_INTERVAL - state.arrivalProgress))
    text(this.ref('arrival-title'), full ? 'A full little world' : ready ? 'A neighbor is on the way' : 'A little room to grow')
    const missing = [
      !conditions.food ? 'gather food or staff a garden' : '',
      !conditions.morale ? 'keep the pantry stocked to lift wellbeing' : '',
      !conditions.beds ? 'build or upgrade a cottage for spare beds' : '',
    ].filter(Boolean)
    text(this.ref('arrival-detail'), full
      ? `All ${MAX_POPULATION} settlers are home. Keep tending your thriving frontier.`
      : ready ? `Your next settler can arrive in ${remaining}s while these needs stay met.`
        : `To welcome a neighbor, ${missing.join(', and ')}.`)
    const progress = this.ref<HTMLProgressElement>('arrival-progress')
    progress.value = full ? ARRIVAL_INTERVAL : Math.min(ARRIVAL_INTERVAL, state.arrivalProgress)
    progress.classList.toggle('is-waiting', !ready && !full)
    progress.setAttribute('aria-valuetext', full ? 'Population limit reached' : ready ? `${remaining} seconds until next arrival` : 'Waiting for arrival requirements')
  }

  private updateBuildings(state: GameState, idle: number): void {
    const structure = JSON.stringify(state.buildings.map((building) => [building.id, building.type]))
    if (structure !== this.buildingStructure) {
      const ids = new Set(state.buildings.map((building) => building.id))
      for (const [id, row] of this.rows) {
        if (!ids.has(id)) {
          row.element.remove()
          this.rows.delete(id)
        }
      }
      const list = this.ref('building-list')
      state.buildings.forEach((building, index) => {
        let row = this.rows.get(building.id)
        if (!row || row.type !== building.type) {
          row?.element.remove()
          row = this.createBuildingRow(building)
          this.rows.set(building.id, row)
        }
        if (list.children.item(index) !== row.element) list.insertBefore(row.element, list.children.item(index))
      })
      this.buildingStructure = structure
    }
    for (const building of state.buildings) {
      const row = this.rows.get(building.id)!
      const definition = BUILDINGS[building.type]
      const stats = getBuildingStats(building)
      const upgrade = getUpgradeInfo(state, building)
      const upgradeFocused = document.activeElement === row.upgrade
      text(row.level, `Level ${building.level}`)
      row.element.dataset.level = String(building.level)
      row.upgrade.hidden = upgrade.nextLevel === null
      if (upgrade.nextLevel === null && upgradeFocused) row.heading.focus({ preventScroll: true })
      row.upgrade.disabled = !upgrade.available
      text(row.upgrade, `Upgrade to level ${upgrade.nextLevel ?? building.level}`)
      row.upgrade.title = upgrade.reason || upgrade.benefit
      text(row.upgradeBenefit, upgrade.benefit)
      text(row.upgradeReason, upgrade.reason)
      row.upgradeReason.hidden = !upgrade.reason || upgrade.nextLevel === null
      for (const [resource, element] of row.upgradeCosts) {
        const cost = upgrade.cost?.[resource] ?? 0
        element.hidden = cost === 0
        text(element.querySelector('span')!, String(cost))
        element.classList.toggle('is-missing', state.resources[resource] < cost)
        element.title = `${cost} ${RESOURCE_NAMES[resource].toLowerCase()} needed`
      }
      text(row.workers, `${building.workers} / ${definition.maxWorkers}`)
      row.minus.disabled = building.workers <= 0
      row.plus.disabled = idle <= 0 || building.workers >= definition.maxWorkers
      row.plus.title = idle <= 0 ? 'No idle settlers available' : building.workers >= definition.maxWorkers ? 'All worker spaces are filled' : `Assign a worker to ${definition.name}`
      if (definition.maxWorkers > 0) {
        const resource = RESOURCES.find((entry) => stats.production[entry] > 0)!
        text(row.production, `${rate(stats.production[resource] * building.workers * 60)} ${resource} / min${building.workers === 0 ? ' · needs workers' : ''}`)
      } else {
        text(row.production, `${stats.beds} beds${building.type === 'hearth' ? ` · unlocks level ${building.level} buildings` : ' · a place to belong'}`)
      }
    }
    text(this.ref('building-count'), `${state.buildings.length} ${state.buildings.length === 1 ? 'place' : 'places'}`)
  }

  private createBuildingRow(building: Building): BuildingRow {
    const definition = BUILDINGS[building.type]
    const element = document.createElement('article')
    element.className = 'building-row'
    element.dataset.buildingId = building.id
    element.innerHTML = `<div class="building-row-top"><span class="building-row-art">${buildingArt(building.type)}</span><div class="building-row-copy"><h4></h4><span class="building-level"></span><p class="building-production"></p></div></div>
      <div class="building-row-bottom"><span class="worker-label">Workers</span><div class="worker-stepper"><button class="stepper-button worker-minus" type="button">${icon('minus')}</button><span class="worker-count"></span><button class="stepper-button worker-plus" type="button">${icon('plus')}</button></div></div>
      <div class="building-upgrade"><p class="upgrade-benefit"></p><div class="upgrade-costs" aria-label="Upgrade cost">${RESOURCES.map((resource) => `<span class="upgrade-cost" data-upgrade-cost="${resource}">${icon(resource)}<span></span><span class="sr-only">${RESOURCE_NAMES[resource]}</span></span>`).join('')}</div><p class="upgrade-reason"></p><button class="button button-light upgrade-building" type="button"></button></div>`
    const heading = element.querySelector<HTMLHeadingElement>('h4')!
    text(heading, definition.name)
    heading.tabIndex = -1
    const minus = element.querySelector<HTMLButtonElement>('.worker-minus')!
    const plus = element.querySelector<HTMLButtonElement>('.worker-plus')!
    minus.setAttribute('aria-label', `Remove worker from ${definition.name}`)
    plus.setAttribute('aria-label', `Assign worker to ${definition.name}`)
    minus.addEventListener('click', () => this.callbacks.onWorker(building.id, -1))
    plus.addEventListener('click', () => this.callbacks.onWorker(building.id, 1))
    const upgrade = element.querySelector<HTMLButtonElement>('.upgrade-building')!
    upgrade.setAttribute('aria-label', `Upgrade ${definition.name}`)
    const descriptionId = `building-upgrade-${++this.rowSequence}`
    const level = element.querySelector<HTMLElement>('.building-level')!
    level.id = `${descriptionId}-level`
    heading.setAttribute('aria-describedby', level.id)
    upgrade.setAttribute('aria-describedby', `${descriptionId}-benefit ${descriptionId}-reason`)
    const upgradeBenefit = element.querySelector<HTMLElement>('.upgrade-benefit')!
    const upgradeReason = element.querySelector<HTMLElement>('.upgrade-reason')!
    upgradeBenefit.id = `${descriptionId}-benefit`
    upgradeReason.id = `${descriptionId}-reason`
    upgrade.addEventListener('click', () => this.callbacks.onUpgrade(building.id))
    const upgradeCosts = new Map<Resource, HTMLElement>()
    for (const resource of RESOURCES) {
      upgradeCosts.set(resource, element.querySelector<HTMLElement>(`[data-upgrade-cost="${resource}"]`)!)
    }
    if (definition.maxWorkers === 0) element.querySelector<HTMLElement>('.building-row-bottom')!.hidden = true
    if (building.type !== 'hearth') {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'remove-building'
      remove.textContent = 'Remove'
      remove.setAttribute('aria-label', `Remove ${definition.name}`)
      remove.title = 'Recover half the construction and upgrade materials'
      remove.addEventListener('click', () => this.callbacks.onDemolish(building.id))
      element.querySelector('.building-row-top')!.append(remove)
    }
    return {
      element, type: building.type, heading,
      production: element.querySelector<HTMLElement>('.building-production')!,
      level,
      upgrade, upgradeBenefit, upgradeReason, upgradeCosts,
      workers: element.querySelector<HTMLElement>('.worker-count')!,
      minus, plus,
    }
  }

  setInteraction(prompt: InteractionPrompt | null): void {
    if (this.interaction?.title === prompt?.title && this.interaction?.detail === prompt?.detail && this.interaction?.key === prompt?.key) return
    this.interaction = prompt ? { ...prompt } : null
    if (prompt) {
      text(this.ref('interaction-key'), prompt.key)
      text(this.ref('interaction-title'), prompt.title)
      text(this.ref('interaction-detail'), prompt.detail)
    }
    this.syncContext()
  }

  setBuildSelection(type: BuildableType | null): void {
    const previous = this.selectedBuild
    const focusInPlacement = this.ref('placement').contains(document.activeElement)
    this.selectedBuild = type
    text(this.ref('keyboard-action'), type ? 'place building' : 'hold to gather')
    this.root.classList.toggle('is-building', type !== null)
    this.root.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((button) => {
      const selected = button.dataset.build === type
      button.classList.toggle('is-selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    if (type) {
      text(this.ref('placement-name'), `Place your ${BUILDINGS[type].name.toLowerCase()}`)
      this.stopGathering()
    }
    this.ref<HTMLButtonElement>('gather').disabled = type !== null
    this.syncContext()
    if (!type && focusInPlacement) {
      const card = previous && !this.ref('build-cards').hidden ? this.root.querySelector<HTMLButtonElement>(`[data-build="${previous}"]`) : null
      const focusTarget = card || this.ref('build-toggle')
      focusTarget.focus({ preventScroll: true })
    }
  }

  private syncContext(): void {
    this.ref('placement').hidden = this.selectedBuild === null
    this.ref('interaction').hidden = this.selectedBuild !== null || this.interaction === null
    this.ref('explore-hint').hidden = this.selectedBuild !== null || this.interaction !== null
  }

  setPlacementStatus(message: string, valid: boolean): void {
    if (message === this.placementMessage && valid === this.placementValid) return
    this.placementMessage = message
    this.placementValid = valid
    text(this.ref('placement-status'), message)
    this.ref('placement').classList.toggle('is-valid', valid)
    this.ref<HTMLButtonElement>('place').disabled = !valid
  }

  setBuildMenu(open: boolean): void {
    const focusInCards = this.ref('build-cards').contains(document.activeElement)
    this.ref('build-cards').hidden = !open
    this.root.classList.toggle('build-menu-open', open)
    this.ref('build-dock').classList.toggle('is-collapsed', !open)
    this.ref('build-toggle').setAttribute('aria-expanded', String(open))
    this.ref('touch-build').setAttribute('aria-expanded', String(open))
    if (!open && focusInCards) {
      this.ref(window.matchMedia('(pointer: coarse)').matches ? 'touch-build' : 'build-toggle').focus({ preventScroll: true })
    }
  }

  showToast(message: string, kind: 'success' | 'info' | 'error' = 'info'): void {
    if (this.settlementOpen && !this.paused) {
      this.showPanelFeedback(message, kind)
      return
    }
    const existing = Array.from(this.toastTimers.keys()).find((toast) => toast.dataset.message === message && toast.dataset.kind === kind)
    if (existing) {
      this.scheduleToast(existing)
      return
    }
    while (this.toastTimers.size >= 3) {
      const oldest = Array.from(this.toastTimers.keys()).find((toast) => !toast.contains(document.activeElement))
      this.dismissToast(oldest ?? this.toastTimers.keys().next().value!)
    }
    const toast = document.createElement('div')
    toast.className = `toast toast-${kind}`
    toast.dataset.message = message
    toast.dataset.kind = kind
    toast.innerHTML = `${icon(kind === 'success' ? 'check' : kind === 'error' ? 'warning' : 'leaf')}<p></p><button class="toast-dismiss" type="button" aria-label="Dismiss notification">${icon('close')}</button>`
    text(toast.querySelector('p')!, message)
    toast.querySelector('button')!.addEventListener('click', () => this.dismissToast(toast))
    const hold = () => {
      window.clearTimeout(this.toastTimers.get(toast))
      this.toastTimers.set(toast, undefined)
    }
    toast.addEventListener('pointerenter', hold)
    toast.addEventListener('focusin', hold)
    toast.addEventListener('pointerleave', () => this.scheduleToast(toast))
    toast.addEventListener('focusout', () => queueMicrotask(() => this.scheduleToast(toast)))
    toast.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        this.dismissToast(toast)
      }
    })
    this.toastStack.append(toast)
    this.scheduleToast(toast)
  }

  private scheduleToast(toast: HTMLElement): void {
    window.clearTimeout(this.toastTimers.get(toast))
    if (this.lifecycle.signal.aborted || !toast.isConnected) return
    const held = toast.matches(':hover') || toast.contains(document.activeElement)
    this.toastTimers.set(toast, held ? undefined
      : window.setTimeout(() => this.dismissToast(toast), toast.dataset.kind === 'error' ? 8000 : 5000))
  }

  private dismissToast(toast: HTMLElement): void {
    const focused = toast.contains(document.activeElement)
    window.clearTimeout(this.toastTimers.get(toast))
    this.toastTimers.delete(toast)
    toast.remove()
    if (focused) {
      const target = this.paused ? this.ref('resume')
        : this.settlementOpen ? this.ref('close-settlement') : document.querySelector<HTMLElement>('#world')
      target?.focus({ preventScroll: true })
    }
  }

  private showPanelFeedback(message: string, kind: 'success' | 'info' | 'error'): void {
    const feedback = this.ref('settlement-feedback')
    window.clearTimeout(this.feedbackTimer)
    text(feedback, message)
    feedback.classList.toggle('is-negative', kind === 'error')
    this.feedbackTimer = window.setTimeout(() => {
      text(feedback, 'Assign workers or improve your buildings.')
      feedback.classList.remove('is-negative')
    }, kind === 'error' ? 8000 : 5000)
  }

  setSavingStatus(value: string): void {
    text(this.ref('welcome-save-status'), value)
    text(this.ref('saving-status'), value)
    text(this.ref('pause-save-status'), value)
  }

  showSettlement(open: boolean): void {
    this.settlementOpen = open
    if (open) this.stopTouch()
    const panel = this.ref('settlement')
    const wasOpen = !panel.hidden
    const focusInPanel = panel.contains(document.activeElement)
    panel.hidden = !open
    if (open && !wasOpen) {
      const latest = Array.from(this.toastTimers.keys()).at(-1)
      if (latest?.dataset.message) {
        this.showPanelFeedback(latest.dataset.message, latest.classList.contains('toast-error') ? 'error' : 'info')
      }
      for (const toast of Array.from(this.toastTimers.keys())) this.dismissToast(toast)
    }
    this.root.classList.toggle('settlement-open', open)
    this.ref('settlement-toggle').setAttribute('aria-expanded', String(open))
    if (open && !wasOpen && this.started && !this.paused) this.ref('close-settlement').focus({ preventScroll: true })
    if (!open && wasOpen && focusInPanel) this.ref('settlement-toggle').focus({ preventScroll: true })
  }

  setPaused(paused: boolean): void {
    if (paused && (!this.started || this.fatal)) return
    this.paused = paused
    this.root.classList.toggle('is-paused', paused)
    this.game.inert = paused
    if (paused) {
      this.stopTouch()
      if (!this.pauseDialog.open) {
        this.priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        this.ref('pause-toasts').append(this.toastStack)
        this.pauseDialog.showModal()
      }
    } else if (this.pauseDialog.open) {
      this.pauseDialog.close()
      this.root.append(this.toastStack)
      if (this.priorFocus?.isConnected && !this.priorFocus.closest('[hidden], [inert]')) this.priorFocus.focus({ preventScroll: true })
      this.priorFocus = null
    }
  }

  setSoundEnabled(enabled: boolean): void {
    const button = this.ref('sound')
    button.setAttribute('aria-pressed', String(enabled))
    button.setAttribute('aria-label', enabled ? 'Turn sound off' : 'Turn sound on')
    button.title = enabled ? 'Turn sound off' : 'Turn sound on'
    button.innerHTML = icon(enabled ? 'sound' : 'muted')
  }

  setSoundPending(pending: boolean): void {
    const button = this.ref<HTMLButtonElement>('sound')
    button.disabled = pending
    button.setAttribute('aria-busy', String(pending))
    button.title = pending ? 'Updating sound...' : button.getAttribute('aria-label') || 'Sound'
  }

  setOverview(active: boolean): void {
    this.root.classList.toggle('is-overview', active)
    const button = this.ref('overview')
    button.setAttribute('aria-pressed', String(active))
    button.setAttribute('aria-label', active ? 'Return to your explorer' : 'Planet overview')
    button.title = active ? 'Return to your explorer (V)' : 'Planet overview (V)'
    this.ref('overview-label').hidden = !active
  }

  setLoadingError(message: string): void {
    this.fatal = true
    this.stopTouch()
    this.setPaused(false)
    this.game.hidden = true
    this.welcome.hidden = false
    this.root.classList.add('is-welcome', 'has-fatal-error')
    text(this.ref('fatal-message'), message)
    this.ref('fatal-error').hidden = false
    this.ref<HTMLButtonElement>('start').disabled = true
    this.ref('fatal-error').focus({ preventScroll: true })
  }

  private canUseTouch(): boolean {
    return this.started && !this.paused && !this.fatal && !this.settlementOpen
  }

  private bindTouch(): void {
    const joystick = this.ref('joystick')
    const move = (event: PointerEvent) => {
      if (this.joystickPointer !== event.pointerId || !this.canUseTouch()) return
      const bounds = joystick.getBoundingClientRect()
      const radius = bounds.width * 0.32
      const dx = (event.clientX - bounds.left - bounds.width / 2) / radius
      const dy = (event.clientY - bounds.top - bounds.height / 2) / radius
      const scale = Math.max(1, Math.hypot(dx, dy))
      const x = dx / scale
      const y = dy / scale
      this.ref('joystick-knob').style.transform = `translate(${x * radius}px, ${y * radius}px)`
      this.callbacks.onMove(x, -y)
    }
    joystick.addEventListener('pointerdown', (event) => {
      if (!this.canUseTouch() || this.joystickPointer !== null || event.button !== 0) return
      event.preventDefault()
      this.joystickPointer = event.pointerId
      joystick.setPointerCapture(event.pointerId)
      joystick.classList.add('is-active')
      move(event)
    })
    joystick.addEventListener('pointermove', move)
    const release = (event: PointerEvent) => {
      if (event.pointerId === this.joystickPointer) this.stopJoystick()
    }
    joystick.addEventListener('pointerup', release)
    joystick.addEventListener('pointercancel', release)
    joystick.addEventListener('lostpointercapture', release)
    const gather = this.ref<HTMLButtonElement>('gather')
    gather.addEventListener('pointerdown', (event) => {
      if (!this.canUseTouch() || this.selectedBuild || this.gatherPointer !== null || event.button !== 0) return
      event.preventDefault()
      this.gatherPointer = event.pointerId
      gather.setPointerCapture(event.pointerId)
      this.gathering = true
      gather.setAttribute('aria-pressed', 'true')
      this.callbacks.onGather(true)
    })
    const releaseGather = (event: PointerEvent) => {
      if (event.pointerId === this.gatherPointer) this.stopGathering()
    }
    gather.addEventListener('pointerup', releaseGather)
    gather.addEventListener('pointercancel', releaseGather)
    gather.addEventListener('lostpointercapture', releaseGather)
    gather.addEventListener('keydown', (event) => {
      if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat && this.canUseTouch() && !this.selectedBuild) {
        event.preventDefault()
        this.gathering = true
        gather.setAttribute('aria-pressed', 'true')
        this.callbacks.onGather(true)
      }
    })
    gather.addEventListener('keyup', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') this.stopGathering()
    })
    gather.addEventListener('blur', () => this.stopGathering())
    window.addEventListener('blur', () => this.stopTouch(), { signal: this.lifecycle.signal })
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stopTouch() }, { signal: this.lifecycle.signal })
  }

  private stopJoystick(): void {
    const pointer = this.joystickPointer
    this.joystickPointer = null
    const joystick = this.ref('joystick')
    if (pointer !== null && joystick.hasPointerCapture(pointer)) joystick.releasePointerCapture(pointer)
    this.ref('joystick-knob').style.transform = ''
    joystick.classList.remove('is-active')
    if (pointer !== null) this.callbacks.onMove(0, 0)
  }

  private stopGathering(): void {
    const pointer = this.gatherPointer
    this.gatherPointer = null
    const gather = this.ref('gather')
    if (pointer !== null && gather.hasPointerCapture(pointer)) gather.releasePointerCapture(pointer)
    gather.setAttribute('aria-pressed', 'false')
    if (this.gathering) this.callbacks.onGather(false)
    this.gathering = false
  }

  private stopTouch(): void {
    this.stopJoystick()
    this.stopGathering()
  }
}

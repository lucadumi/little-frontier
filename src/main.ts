import '@fontsource-variable/fraunces/wght.css'
import '@fontsource-variable/nunito-sans/wght.css'
import './style.css'
import { GameUI } from './ui.ts'
import { SoundEffects } from './game/audio.ts'
import { BUILDINGS, SAVE_KEY } from './game/config.ts'
import { GameEngine, GraphicsUnavailableError } from './game/engine.ts'
import {
  assignWorker, createInitialState, demolishBuilding, getObjectives, parseSave,
  SaveValidationError, serializeSave,
} from './game/simulation.ts'
import type { GameState } from './game/types.ts'

declare global {
  interface Window {
    __FRONTIER__?: {
      snapshot(): GameState
      diagnostics(): ReturnType<GameEngine['diagnostics']>
    }
  }
}

interface LoadedGame {
  state: GameState
  hasSave: boolean
  loadError?: string
  unreadableSave: boolean
}

function loadGame(): LoadedGame {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw === null) return { state: createInitialState(), hasSave: false, unreadableSave: false }
    return { state: parseSave(raw), hasSave: true, unreadableSave: false }
  } catch (error) {
    if (error instanceof SaveValidationError) {
      return {
        state: createInitialState(), hasSave: false, unreadableSave: true,
        loadError: 'Your saved frontier could not be read. Starting a new frontier will ask before replacing it.',
      }
    }
    if (error instanceof DOMException) {
      return {
        state: createInitialState(), hasSave: false, unreadableSave: false,
        loadError: 'This browser is blocking local saves. You can play, but your progress may be lost when this tab closes.',
      }
    }
    throw error
  }
}

function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) throw new Error('The game container is missing.')
  const canvas = document.createElement('canvas')
  canvas.id = 'world'
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Little Frontier 3D world. Use WASD to move, hold E to gather, and drag to look around.')
  const overlay = document.createElement('div')
  overlay.id = 'interface'
  app.replaceChildren(canvas, overlay)

  const loaded = loadGame()
  let state = loaded.state
  let started = false
  let paused = false
  let buildMenuOpen = true
  let overviewActive = false
  let buildMenuBeforeOverview = true
  let settlementOpen = false
  let saveErrorShown = false
  let needsSaveReplacementConsent = loaded.unreadableSave
  let completedObjectives = new Set(getObjectives(state).filter((objective) => objective.complete).map((objective) => objective.id))
  const sound = new SoundEffects()
  let engine: GameEngine

  const setPaused = (value: boolean) => {
    if (!started) return
    paused = value
    engine.setPaused(value)
    ui.setPaused(value)
  }

  const save = (manual = false): boolean => {
    if (!started) return false
    try {
      localStorage.setItem(SAVE_KEY, serializeSave(state))
      ui.setSavingStatus('Saved on this device')
      saveErrorShown = false
      if (manual) ui.showToast('Your frontier is saved on this device.', 'success')
      return true
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
      ui.setSavingStatus('Progress is not saved')
      if (!saveErrorShown || manual) ui.showToast('Your browser could not save this frontier. Free some storage or allow local site data before closing the tab.', 'error')
      saveErrorShown = true
      return false
    }
  }

  const refresh = () => {
    ui.update(state)
    if (!started) return
    const objectives = getObjectives(state)
    for (const objective of objectives) {
      if (objective.complete && !completedObjectives.has(objective.id)) {
        ui.showToast(`Milestone reached: ${objective.title}`, 'success')
        completedObjectives.add(objective.id)
      }
    }
  }

  const toggleBuildMenu = () => {
    buildMenuOpen = !buildMenuOpen
    if (overviewActive) buildMenuBeforeOverview = buildMenuOpen
    ui.setBuildMenu(buildMenuOpen)
    if (!buildMenuOpen) engine.selectBuilding(null)
  }

  const toggleSettlement = () => {
    settlementOpen = !settlementOpen
    ui.showSettlement(settlementOpen)
    refresh()
  }

  const toggleSound = async () => {
    if (typeof AudioContext === 'undefined') {
      ui.showToast('This browser does not support game audio.', 'error')
      return
    }
    try {
      await sound.setEnabled(!sound.enabled)
      ui.setSoundEnabled(sound.enabled)
      if (sound.enabled) sound.play('gather')
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
      ui.showToast(`Sound could not start: ${error.message}`, 'error')
    }
  }

  const ui = new GameUI(overlay, {
    onStart() {
      if (needsSaveReplacementConsent) {
        const approved = window.confirm('This saved frontier cannot be loaded. Starting fresh will replace it with a new world. Continue?')
        if (!approved) return
        needsSaveReplacementConsent = false
      }
      started = true
      ui.showGame()
      engine.start()
      refresh()
      save()
    },
    onBuildSelect(type) {
      engine.selectBuilding(type)
    },
    onBuildToggle: toggleBuildMenu,
    onPlace: () => engine.placeSelected(),
    onRotate: () => engine.rotateBuilding(),
    onGather: (held) => engine.setGathering(held),
    onWorker(buildingId, change) {
      const result = assignWorker(state, buildingId, change)
      ui.showToast(result.message, result.ok ? 'success' : 'error')
      refresh()
      if (result.ok) save()
    },
    onDemolish(buildingId) {
      const building = state.buildings.find((entry) => entry.id === buildingId)
      if (!building) {
        ui.showToast('This building is no longer in your settlement.', 'error')
        return
      }
      if (!window.confirm(`Remove this ${BUILDINGS[building.type].name.toLowerCase()}? Half its construction materials will be returned.`)) return
      const result = demolishBuilding(state, buildingId)
      ui.showToast(result.message, result.ok ? 'success' : 'error')
      engine.syncBuildings()
      refresh()
      if (result.ok) save()
    },
    onPauseToggle: () => setPaused(!paused),
    onSoundToggle: () => { void toggleSound() },
    onOverviewToggle: () => engine.toggleOverview(),
    onSettlementToggle: toggleSettlement,
    onSave: () => { save(true) },
    onReset() {
      if (!window.confirm('Start a fresh frontier? This replaces your current world and saved progress. This cannot be undone.')) return
      state = createInitialState()
      completedObjectives = new Set()
      engine.replaceState(state)
      settlementOpen = false
      ui.showSettlement(false)
      setPaused(false)
      refresh()
      save()
      ui.showToast('A new little world, ready for a fresh beginning.', 'success')
    },
    onMove: (x, y) => engine.setMovement(x, y),
    onJump: () => engine.jump(),
  }, { hasSave: loaded.hasSave, loadError: loaded.loadError })

  try {
    engine = new GameEngine(canvas, state, {
      onChange: refresh,
      onToast: (message, kind) => ui.showToast(message, kind),
      onInteraction: (prompt) => ui.setInteraction(prompt),
      onPlacement: (message, valid) => ui.setPlacementStatus(message, valid),
      onBuildChange(type) {
        if (type && overviewActive) engine.toggleOverview()
        ui.setBuildSelection(type)
        if (type && !buildMenuOpen) {
          buildMenuOpen = true
          ui.setBuildMenu(true)
        }
      },
      onBuildMenuToggle: toggleBuildMenu,
      onPauseToggle: () => setPaused(!paused),
      onSettlementToggle: toggleSettlement,
      onOverviewChange(active) {
        if (active === overviewActive) return
        overviewActive = active
        ui.setOverview(active)
        if (active) {
          buildMenuBeforeOverview = buildMenuOpen
          buildMenuOpen = false
          engine.selectBuilding(null)
        } else {
          buildMenuOpen = buildMenuBeforeOverview
        }
        ui.setBuildMenu(buildMenuOpen)
      },
      onSound: (kind) => sound.play(kind),
      onFatal(message) {
        const saved = save()
        ui.setLoadingError(`${message}${saved ? ' Your progress is saved on this device.' : ' Your latest progress could not be saved.'}`)
      },
    })
  } catch (error) {
    if (!(error instanceof GraphicsUnavailableError)) throw error
    ui.setLoadingError(error.message)
    return
  }

  refresh()
  const autosave = window.setInterval(() => { save() }, 8000)
  const onPageHide = () => { save() }
  window.addEventListener('pagehide', onPageHide)
  if (import.meta.env.DEV) {
    window.__FRONTIER__ = {
      snapshot: () => structuredClone(state),
      diagnostics: () => engine.diagnostics(),
    }
  }
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      save()
      window.clearInterval(autosave)
      window.removeEventListener('pagehide', onPageHide)
      engine.dispose()
      delete window.__FRONTIER__
    })
  }
}

bootstrap()

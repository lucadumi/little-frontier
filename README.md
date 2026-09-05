# Little Frontier

A colorful, third-person survival and settlement-building prototype on a small spherical planet. Walk all the way around the world, gather materials, and turn a founders' camp into a self-sufficient village.

Built with TypeScript, Three.js, and Vite. All scenery, buildings, characters, icons, and sound effects are generated locally. No account, backend, or external asset service is required.

## Run locally

Use Node.js 22.18 or newer.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. A browser with WebGL 2 and hardware acceleration is required.

## Controls

| Action | Control |
| --- | --- |
| Move around the planet | WASD or arrow keys |
| Sprint | Hold Shift |
| Jump | Space |
| Turn the camera | Drag on the world with either mouse button |
| Zoom | Mouse wheel |
| Gather a nearby resource | Hold E |
| Show or hide construction | B |
| Select a building | 1, 2, 3, 4 |
| Place a building | Click the ground or press E |
| Rotate a building | Q or R |
| Cancel construction / pause | Escape |
| Open the settlement panel | T |
| Switch between close and planet views | V |

Touch devices have a movement stick, gather and jump buttons, and drag-to-look camera controls.

## Growing a settlement

Trees provide wood, outcrops provide stone, and berry bushes provide food. Exhausted resources regrow after a short time. Building previews show whether there is enough space and whether you can afford construction.

Cottages add two beds. A well-fed, content settlement welcomes another settler every 30 seconds while housing is available. Each arrival uses two food. The hearth houses your first three settlers; the prototype supports up to 18.

Gardens, lumberyards, and quarries need workers. Open the settlement panel to assign idle settlers. Each building can employ two people. One grower produces 6 food per minute, one woodcutter produces 5 wood per minute, and one stoneworker produces 4 stone per minute. Every settler eats 0.48 food per minute.

Food shortages reduce wellbeing and stop immigration. Settlers do not permanently die in this prototype, so gathering berries can always begin a recovery. Removing a building returns half its construction materials and releases its workers. Occupied housing cannot be removed if it would leave settlers without beds.

The five objectives introduce gathering, housing, food production, resource production, and village growth. Play continues after the objectives are complete.

## Saving

Progress is automatically saved every eight seconds, after worker changes, and when leaving the page. The pause menu also has a manual save action. Saves stay in this browser's local storage under `little-frontier-save-v1`; they do not sync to another browser or device.

Time does not advance while paused, while the tab is hidden, or while the game is closed. A fresh start asks before replacing your saved world. A corrupt save is reported rather than silently loaded or reset.

## Development

```sh
npm test
npm run build
```

Browser interaction coverage uses Playwright:

```sh
npx playwright install chromium
npm run test:browser
```

`src/game/simulation.ts` contains the resource economy, workers, progression, and save validation. `src/game/math.ts` handles spherical movement and terrain sampling. `src/game/world.ts` and `models.ts` generate the scenery and models. `src/game/engine.ts` connects rendering, input, and gameplay. `src/ui.ts` and `src/style.css` provide the interface.

The interface follows Impeccable's design guidance, with locally served Fraunces and Nunito Sans typography. Run its design detectors against the interface sources with:

```sh
npm run ui:check
```

This is a single-player prototype, not a production multiplayer strategy service. Online alliances, combat, monetization, and a backend are not included.

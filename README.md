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

Touch devices have an analog movement stick, gather and jump buttons, and drag-to-look camera controls. Move the stick a little for careful positioning or to its edge for full walking speed.

Planet view fits the globe to both portrait and landscape screens and temporarily folds the build dock away. Returning to your explorer restores the dock; selecting a building also returns to the close view.

## Growing a settlement

Trees provide wood, outcrops provide stone, and berry bushes provide food. Exhausted resources regrow after a short time. Building previews show whether there is enough space and whether you can afford construction.

Cottages start with two beds. A well-fed, content settlement welcomes another settler every 30 seconds while housing is available. Each arrival uses two food. The hearth houses your first three settlers; the prototype supports up to 18.

Gardens, lumberyards, and quarries need workers. Open the settlement panel to assign idle settlers. Each building can employ two people. At level 1, one grower produces 6 food per minute, one woodcutter produces 5 wood per minute, and one stoneworker produces 4 stone per minute. Every settler eats 0.48 food per minute.

Food shortages reduce wellbeing and stop immigration. Settlers do not permanently die in this prototype, so gathering berries can always begin a recovery. Removing a building returns half its construction and upgrade materials and releases its workers. Occupied housing cannot be removed if it would leave settlers without beds.

The five objectives introduce gathering, housing, food production, resource production, and village growth. Play continues after the objectives are complete.

### Upgrading your frontier

Every building can reach level 3. Open the settlement panel to see its next upgrade, exact material cost, and any unmet requirements. Upgrades preserve the building's position and assigned workers, and each tier has a distinct 3D model without needing a larger plot.

The hearth unlocks the same level for other buildings. Level 2 requires five settlers, 60% wellbeing, 24 wood, 16 stone, and 10 food. Level 3 requires eight settlers, 60% wellbeing, 48 wood, 36 stone, and 18 food.

| Building benefit | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| Cottage beds | 2 | 3 | 4 |
| Food per grower per minute | 6 | 9 | 12 |
| Wood per woodcutter per minute | 5 | 7.5 | 10 |
| Stone per stoneworker per minute | 4 | 6 | 8 |

The hearth always provides three starting beds, and the settlement limit remains 18 people. Workplace upgrades improve each worker's output rather than adding more worker slots.

## Saving

Progress is automatically saved every eight seconds, after worker changes or upgrades, and when leaving the page. The pause menu also has a manual save action. Saves stay in this browser's local storage under `little-frontier-save-v1`; they do not sync to another browser or device.

Earlier prototype saves migrate automatically to the level-aware save format. Resources, population, workers, exploration position, and progress are preserved; existing buildings begin at level 1.

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

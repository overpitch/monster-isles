# Monster Isles

A monster-collecting adventure made for (and designed by) Murilo. Explore four islands, catch 15 monsters, battle trainers, and play together with a friend in split screen. It runs in a web browser, including Microsoft Edge on Xbox with controllers.

## Play online

**https://overpitch.github.io/monster-isles/**

**On Xbox:** open the game in Microsoft Edge, then **hold the Menu ☰ button** for about a second so the controller plays the game instead of moving the cursor.

## The game

- **Make your own trainer:** name, skin, hair, hair color, shirt and pants. Professor Oakley gives you a starter: **Leafup** (grass), **Embit** (fire) or **Splashel** (water).
- **Four islands** joined by bridges: Sunny Beach (start), Spooky Forest, Volcano Island and Frost Island. Each has a town with a **Monster Center** (heals your team, PC box for extra monsters) and a **shop**, plus trainers and different wild monsters.
- **Wild monsters** hide in tall grass. Weaken them, then throw a **Capture Orb** (or Super Orb) to catch them.
- **Classic turn-based battles** with 8 types and matchups:
  - fire > grass > water > fire
  - electric beats water and wind, rock beats electric, fire and wind, and wind beats grass
  - shadow and light beat each other
- Monsters gain XP, level up, learn moves and **evolve**.
- **8 trainers** to beat for money, and **Aurorix**, a legendary monster, waiting at the shrine at the top of Frost Island.
- **Just explore:** no badges, catch everything and battle whoever you like.
- **Auto-saves** every 10 seconds and after battles. Each trainer is saved on that device. On the title screen, pick your trainer to continue.

## Two players

A second controller can **join any time** by pressing A. The screen splits left and right, and both players explore the same world with their own trainer.

- **Team up in battles:** walk up to your friend while they're battling and press A to jump in. That makes 2 vs 1 against wild monsters, or 2 vs 2 against trainers.
- **Face your friend and press A** to battle each other, trade monsters or give items. Friendly battles heal both teams afterwards.
- Player 2 can leave from the pause menu. Their trainer is saved.

## Controls

| | Xbox controller | Keyboard (player 1) | Keyboard (player 2) |
|---|---|---|---|
| Move | Left stick / d-pad | W A S D | Arrow keys |
| Talk / choose (A) | A | Space | / |
| Back (B) / hold to run | B | K | , |
| Menu | Menu ☰ or X | Enter or J | Numpad Enter |

## Files

- `index.html` loads everything. Bump the `?v=` numbers when publishing changes so browsers fetch the new files.
- `js/core.js`: screen, sounds and controls (shared with Mega Brawlers).
- `js/monsters.js`: types, moves, the 15 species and their cartoon designs, leveling and evolving.
- `js/world.js`: the island map, towns, trainers and townspeople, and drawing the world from above.
- `js/fight.js`: turn-based battles: moves, type matchups, catching, XP, team-ups and player-vs-player.
- `js/game.js`: trainers, exploring, menus, the shop and Monster Center, trading, saving, split screen and the title screen.
- `tests/helpers.js`: test tools for the browser console. `checkReach()` checks that everything can be walked to. `mash()` presses random buttons on two fake controllers to look for crashes.

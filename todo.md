# Trade Winds - Development Progress

## MVP Scope

### Core Systems
- [x] Project setup (Kaplay + Vite)
- [x] Hello world rendering
- [x] Hex grid math utilities
- [x] Procedural map generation (islands + climate zones)
- [x] Map rendering with camera pan/zoom

### Gameplay
- [ ] Place trading posts (click island)
- [ ] Buy ships, assign routes
- [ ] Basic economy (buy low, sell high)
- [ ] Pirate spawns + auto-combat
- [ ] Win/lose conditions

### Misc 
- [ ] fix screen edge camera panning (once cursor exits window stop scrolling) 
- [ ] birds should be affected by speed mode (fly faster/slower etc)
- [ ] offset bird animations so they aren't all flapping at the same time
- [ ] don't allow multiple things to be built on a single hex lol
- [ ] build queue: allow ports to build multiple ships one after the other
- [ ] shift+control left click to create a waypoint path for the selected ship. 
-- [ ] once working ^, start w/ P hotkey to create a patrol route 
- [ ] future: dynamic fog of war (hide again as units move away / destroyed)
- [ ] cursor upgrades: show hand when spacebar pressed; show sword when cmd click on ship
- [ ] don't render waves at edge of world
- [ ] do a scale pass on structures and boats. Pirate ships are huge. The largest ship should probably be 75% of a hex. Ports should be a full hex. 
- [ ]  don't show pathfinding line - super busy with a fleet selected; maybe an option you can turn on 
- [ ] don't allow bulk selection of enemy units (drag select); maybe don't allow select / hover at all. Just show their health bar? 
- [ ] show some impact dust when a cannon ball hits it's target 


### Bugs
- [ ] render build, health bars on top of units
- [ ] render birds above everything
- [ ] buildings that take damange while repairing should just deduct the damage from repair progress (right now they will repair but not all the way lol)
- [ ] don't allow tower placement mode if crew cap is max
- [ ] render build bar (blue bar) above units, sprites

### Defend notes 
- [ ] make sure pirates spawn off screen, under fog of war 
- [ ] Resource generation is too fast
- [ ] Upgrading towers is too easy / fast
- [ ] Need a few different pirate units for sure!
- - [ ] Longer range, nets to slow ships down, faster smaller units, etc 
- [ ] add some different AI stratgies: bezerk focus on port, only attack settlements, attack in groups vs flank, rertreat when at 25% health. 
- [ ] when crew cap is at max, make it red so it's obvious youre at max
- [ ]


## Ideas
- Manual ship combat mini-game
- Named captains with skills
- Weather/seasons affecting routes
- Rival AI trading companies
- Historical events
- Volcanoes! 

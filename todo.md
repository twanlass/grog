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

### Defend notes 
- [ ] Cutters are probably too strong; maybe 1 cutter is worth 1/2 a pirate ship
- [ ] Pirate ship water trails aren't visible 
- [ ] Pirate AI: should have them focus on the primary port and attack that; losing that loses the game
- [ ] make sure pirates spawn off screen, under fog of war 
- [ ] Resource generation is too fast
- [ ] Upgrading towers is too easy / fast
- [ ] Need a few different pirate units for sure!
- - [ ] Longer range, nets to slow ships down, faster smaller units, etc 


## Ideas
- Manual ship combat mini-game
- Named captains with skills
- Weather/seasons affecting routes
- Rival AI trading companies
- Historical events
- Volcanoes! 

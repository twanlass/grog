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
- [ ] add 4x, 5x speed modes
- [ ] birds should be affected by speed mode (fly faster/slower etc)
- [ ] offset bird animations so they aren't all flapping at the same time
- [ ] don't allow multiple things to be built on a single hex lol
- [ ] port waypoints: allow player to set spawn point for newly built ships
- [ ] build queue: allow ports to build multiple ships one after the other
- [ ] settlement selection mode: restrict to hexs on current island / contigous land and only with x hexs of port
- [ ] when a port is destroyed: 1. existing settlements should stop producing; 2. need a way to re-build a port and "attach" settlements to it. Maybe pathfind nearest via land? 
- [ ] shift+control left click to create a waypoint path for the selected ship. 
-- [ ] once working ^, start w/ P hotkey to create a patrol route 


## Ideas
- Manual ship combat mini-game
- Named captains with skills
- Weather/seasons affecting routes
- Rival AI trading companies
- Historical events
- Volcanoes! 

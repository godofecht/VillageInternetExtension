# slow internet thing

makes your internet slow. why? because sometimes you need to test stuff on slow internet. do i need to explain this?

## what it does

- slows down your internet
- adds lag
- drops packets
- randomly breaks stuff
- simulates crappy ISPs that throttle specific sites

## setup

1. go to `opera://extensions`
2. turn on developer mode
3. load unpacked
4. select this folder
5. whatever

## using it

1. click the icon (if it even shows up)
2. set numbers for speed/lag/etc
3. hit start
4. suffer
5. hit stop when you've had enough

## settings

- **download/upload**: slower = worse, what did you expect
- **latency**: higher = more annoying lag
- **packet loss**: % of stuff that just disappears into the void
- **random failures**: % chance of requests just dying
- **outage duration**: how long everything breaks (seconds)
- **outage frequency**: how often everything breaks
- **targeted throttling**: specific sites to punish
- **throttling level**: how bad to make it for those sites

## tech stuff

uses webRequest API + service worker. used to be simple before manifest v3 ruined everything. had to switch to declarativeNetRequest which is garbage and can't do half the things webRequest could.

## limitations

- sometimes doesn't work
- can't throttle certain things because manifest v3 sucks
- probably breaks on secure pages
- definitely breaks with opera vpn

## why

because the internet isn't always gigabit fiber with 0.1ms latency. deal with it.

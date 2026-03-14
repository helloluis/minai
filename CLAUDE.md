# Minai — Claude Notes

## VPS / SSH

**Never run parallel SSH commands** (multiple simultaneous `ssh beanie` connections). The VPS has limited resources and parallel SSH sessions cause connection timeouts, PM2 daemon crashes, and can take the entire server down. Always run SSH commands sequentially, waiting for each to complete before starting the next.

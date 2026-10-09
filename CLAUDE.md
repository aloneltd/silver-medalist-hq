# silver-medalist-hq

## Deploying (read first, do not rediscover)

_Checked 2026-10-09._

- **Production = Vercel**, account `mark-9439`, project `silver-medalist-hq`, live at https://silver-medalist-hq-zeta.vercel.app
- **NOT linked to GitHub: a push does NOT deploy.** Deploy runs on Mark's Mac: `vercel --global-config ~/.vercel-mark2 --prod --yes` from this repo's folder in `~/Documents/Claude/WorkflowA`.
- Not linked on purpose: the Mac copy's `v3` branch is ahead of `main`. Decide which branch is production, then link the repo in Vercel.
- **Cloud / phone / claude.ai sessions** have NO Vercel login and `api.vercel.com` is blocked there. Do not try the Vercel CLI from the cloud and do not make Mark explain this again. Say once: "this deploy runs on the Mac", give the command, done.

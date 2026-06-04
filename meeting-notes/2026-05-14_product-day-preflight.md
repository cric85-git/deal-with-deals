# Product Day Preflight Meeting
**Date:** May 14, 2026  
**Key Stakeholder:** Tapas Roy (roy@, VP L12)  
**Presenter:** Madhur  

---

## Demo Feedback from Tapas

### Messaging & Positioning (for Panos)
- **Lead with the vision:** "We are building a world where issues get fixed autonomously." Jassy finds a bug, gives it to Panos, and it's already fixed.
- **One-sentence AgentSpace pitch:** When an anomaly is detected, an autonomous agent diagnoses and fixes it.
- **Frame it as:** An SDE has a friend/co-worker having conversations about the issue and the fix — it's all pre-set-up and working autonomously from Day 1 for an SDE1.
- **Don't go into developer flow details** — Panos wants marketing highlights, not implementation specifics.
- Remove the "Preview" button before launch.

### Technical & Product Questions Raised
- How did you find the issue? Automatically? Talk about the detection story.
- Can you automate the ticket creation?
- Is this live? When was the detection done? Did we halt the OTA?
- On customer reviews — when an issue is observed, can it also find the customer logs? How will it get VP approval for log access?

### Validation & Acknowledgment
- "You have not done just the easy part — you have done the hard part too."
- Tell everyone this exists before anyone builds a new log analysis tool.
- Talk to Mayur — our code is open, teams can contribute via away-team model.

### Research Pointer
- Paper on reinforcement learning and re-generative prompts: https://arxiv.org/pdf/2510.02453
- Tapas is already using this approach for his agent. Explore if it can help ours.

---

## Action Items

| # | Action | Owner | Notes |
|---|--------|-------|-------|
| 1 | Coordinate with Suresh (ASBX) — ensure he is invited to the demo | Madhur/Shail | Suresh owns DSAI; put AgentSpace there for all SDEs |
| 2 | Integrate with Device Farm for repo and validation | Srivathsan | |
| 3 | Demo to CS team — create a CS-facing version | Madhur | Look at CS logs and CS call data to find emerging issues |
| 4 | Explore FireLens as easy route, but keep exploring CS path | Madhur | |
| 5 | Add cost analysis to the doc | Madhur | How much does it cost today? What happens as adoption scales? |
| 6 | Add success metrics to the doc | Madhur | How people are using it, how it's helping |
| 7 | Add reinforcement learning approach to the doc | Madhur | |
| 8 | Go to every team and show the demo | Madhur | Tapas's direct feedback |
| 9 | Work with Suresh to put this in DSAI for all SDEs | Madhur/Shail | |
| 10 | Confirm Charlie will be at the May 28 demo | Madhur/Shail | Also confirm Suresh attendance |
| 11 | Explore RL paper (arxiv 2510.02453) for agent improvement | Team | |

---

## Tapas's Guidance (Summary)
- Solve the hard problems — the ones other teams don't have expertise or ability to do.
- Show it broadly — every team, CS, DSAI.
- Think about cost and scale from the start.
- Frame for leadership: autonomous, pre-configured, zero-friction for new SDEs.

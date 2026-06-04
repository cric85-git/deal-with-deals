# Open Questions — Panacea Agent Meeting
**Session:** 2026-05-15 07:35:22

## 1. Organizational Ownership of Troubleshooting Agent

Where does the troubleshooting agent sit organizationally? The discussion surfaced tension between Vishal's team (currently owning the agent doc and STM role for crashes/logs) and Francisco's team (owning NSA as STM). Tapas plans to discuss with Madul on Monday to clarify whether the troubleshooting agent moves entirely under Francisco with Anindya taking senior SDE lead. No resolution reached in this session.

## 2. Advisory Models / Transfer Models for Device Diagnosis

Tapas shared a paper on "advisory models" (also called transfer models) — the pattern where an input prompt is first enriched by a domain-specific advisory model before being sent to a frontier model for execution. The question is whether this pattern applies to Kanto Crash diagnosis (e.g., a Fire TV crash advisory model). Srivathsan expressed interest but was advised to defer this stream and prove the current approach first. Remains a future exploration track.

## 3. Patent Opportunities in DS2

Neither Srivathsan nor Tapas could recall a patent filing from DS2 in five years. The agentic orchestration work — particularly the "orchestrator takes a stick" pattern of iterative correction with subagents — was identified as potentially novel. No specific claims drafted yet; to be discussed further during Bellevue visit (May 26–29).

## 4. Resource Allocation for June Push

How to staff the productionalization effort between now and end of June remains open. Options discussed: pull Anindya partially, get an L5 or L6 from another team, or have Srivathsan proceed solo (slower). Depends on Tapas's Monday conversation with Madul.

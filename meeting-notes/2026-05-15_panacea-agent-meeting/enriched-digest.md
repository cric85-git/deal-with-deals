# Enriched Digest — Panacea Agent Meeting
**Session:** 2026-05-15 07:35:22
**Participants:** Srivathsan Aravamudan, Tapas (manager)

---

## Meeting Retrospective and Tapas's Feedback

The conversation opened with a debrief of a previous day's demo to Panos (likely a senior leader). Tapas observed that Panos appeared engaged by the complexity of the problems being solved through agentic workflows, contrasting them favorably against simpler AI demos he had seen from other teams. The key takeaway was that the Panacea troubleshooting agent addresses genuinely hard diagnostic problems — not trivial automation — and that framing should be preserved for the upcoming product day presentation. Tapas noted that Panos appeared to be using his own AI agent during the meeting (mentioning "you will receive an email from my agent"), suggesting he is personally invested in the agentic paradigm.

Tapas shared a paper on "advisory models" (also called transfer models), a pattern where an input prompt is first routed through a domain-specific advisory model for enrichment before being sent to a frontier model for execution. The idea is to create advisory models per domain — one for Kanto Mercer crashes, one for Fire TV crashes — that inject domain knowledge into prompts before the general-purpose model acts. Srivathsan expressed interest but was advised to defer this exploration and prove the current approach first.

## Three Workstreams and Cognitive Load in Agentic Orchestration

Srivathsan outlined three parallel workstreams. The first concerns high cognitive load in agentic workflows — a problem he described as analogous to human cognitive overload. When an agent's context or task complexity exceeds a threshold, output quality degrades as the model "rushes to complete." The solution is subagent orchestration, but this introduces a second-order problem: the orchestrator itself accumulates cognitive load from monitoring and correcting multiple subagents. Srivathsan described a pattern where the orchestrator "takes a stick" — actively validating subagent outputs, injecting corrective context, and forcing re-execution when trajectories diverge. This pattern, which he has implemented in MeshClaw's orchestration layer, requires careful tuning to balance delegation breadth against orchestrator overhead.

The second workstream is productionalization of the existing POC. The current implementation runs in a development environment ("DevDust"), which Tapas flagged as uncomfortable for a demo. The plan is to freeze the current branch as a "product day code freeze," deploy the as-is version to production, and then iterate on the tuned agent separately.

The third workstream concerns partner adoption and feedback. The team lacks customer anecdotes because no external partners are actively using the tools yet. Driving adoption with Device OS as the first solid partner was identified as the priority between now and June 3rd.

## Productionalization Plan: Kanto Mercer and Black Screen Detection

The concrete plan for the next 15 days centers on Kanto Mercer — a Fire TV device codename (likely the next major launch after Calypso in the Vega product line). Thomas is deploying a black screen issue detection model for Kanto Mercer devices. The end-to-end workflow would be: model detects black screen issue → Panacea creates a case → analyzers run (both generic and domain-specific) → agent produces diagnosis → integration with AgentSpaces to generate a code review (CR) with a fix.

Srivathsan received 56 Jiras from Richard (a TPM on the Device OS side) representing Kali-era issues. These serve dual purposes: validating that existing tooling is sufficient for Kanto Mercer troubleshooting, and building ground truth (issue → resolution pairs) for testing the agent's accuracy. The initial assessment is that the existing analyzer handles most cases, with the only identified gap being log analysis integration — the logs agent is not yet properly integrated into the system.

## Resource Planning and Organizational Questions

A significant portion of the discussion addressed staffing and organizational ownership. The troubleshooting agent currently sits in an ambiguous position between Vishal Chandak's scope (STM for crashes and logs, owner of the agent doc) and Francisco's team (STM for NSA — the broader platform). Tapas plans to discuss with Madul (their director) on Monday whether to formally move the troubleshooting agent under Francisco, with Anindya taking senior SDE lead.

Anindya is currently working on the issue import flow and the diagnosis MCP. The device-diagnosis-mcp (available in the AIM MCP registry) currently exposes one tool — search_analyzers — which queries the analyzer registry. Additional ledger-related tools will be added as the service implementation progresses. The crash-query-service-mcp (released by the DAS team in April 2026 with 13 tools for crash analysis) is the companion MCP for crash data.

Tapas committed to securing additional resources — potentially an L5 or L6 from another team — to accelerate the June push. He requested Srivathsan send an email by Monday noon outlining the full scope of work, achievable milestones with current capacity, and specific areas needing help.

## Product Day Strategy

For the product day presentation (approximately 10 days out), the team decided not to build anything new. Instead, they will reposition and reword existing capabilities to maximize impact for Panos. The key narrative: "Next time Jesse reaches out, your response is 'our agent has already identified it and a fix is being deployed.'" The demo should avoid excessive technical depth, scrolling through agentic workflows, or showing too much infrastructure — focus on the outcome.

A forcing function was proposed: schedule a meeting with Bijou and Richard for end of first week of June to demo the POC running against beta devices. This creates a concrete milestone for the productionalization effort.

## Patent Opportunity

Tapas raised that DS2 has not filed a patent in five years. The agentic orchestration work — particularly the iterative correction pattern where an orchestrator validates and re-drives subagent outputs with injected context — was identified as potentially novel and patentable. Both agreed this deserves attention but acknowledged bandwidth constraints. Face-to-face discussions are planned during Tapas's Bellevue visit (May 26–29).

## Decisions

1. **No new features for product day** — reposition existing capabilities only.
2. **Freeze current POC branch** — label as product day code freeze, deploy as-is to production.
3. **Focus next 15 days on Kanto Mercer agent tuning** using Kali Jiras as ground truth.
4. **Defer advisory model exploration** — prove current approach first, iterate later.
5. **Tapas to discuss org positioning with Madul Monday** — troubleshooting agent likely moves under Francisco.

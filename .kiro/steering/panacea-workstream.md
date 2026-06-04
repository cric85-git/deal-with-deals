---
inclusion: auto
description: "Context about the Panacea (DS2 Troubleshooting Suite) workstream — architecture, pipeline stages, autonomy levels, integrations, and roadmap."
---

# Panacea (DS2 Troubleshooting Suite) — Workstream Context

## What is Panacea

Panacea is an extensible, event-driven framework for automated observability and troubleshooting of Amazon devices and services at scale. It ensures device problems never reach customers, and when they do, fixes ship before customers notice. Panacea collapses issue resolution from days/weeks to minutes/hours.

Panacea detects issues from system telemetry or a single customer review, diagnoses root causes in minutes instead of weeks, and generates fixes autonomously. The framework is extensible by design — any team can plug in their own detection models and diagnosis workflows.

It is live today for Kindle, Tablet, Fire TV, and Echo.

## Three-Stage Pipeline

1. **Detect** — Continuously monitors signals across the fleet: device metrics, cloud metrics, support contacts, engagement patterns, and customer review ratings. Subject matter experts define issue detection models. Issues can also originate from tickets, customer reviews, and manual triggers.

2. **Diagnose** — Automatically collects diagnostic evidence (crash stack traces, device logs, user activity events, system health metrics, customer reviews/contacts, recent system changes). AI agents reason across this evidence using curated knowledge bases to identify root cause. They read source code, trace commits, review documentation, and correlate with diagnostic evidence.

3. **Remediate** — Determines appropriate action: generating a code fix and publishing a code review, pausing an OTA deployment, or rolling back a service deployment/configuration change. Code fixes go through standard code review and deployment guardrails.

## Autonomy Ladder

- **L0: Human-driven** — Engineer triggers and supervises everything.
- **L1: Agent-assisted** — Agent does the work; human approves every action.
- **L2: Agent-led, human-gated** — Agent acts autonomously up to a blast-radius threshold; human approves high-impact actions (code merge, rollback, pause OTA).
- **L3: Fully autonomous** — Agent detects, diagnoses, and remediates end-to-end. Requires proven L2 track record; applies only to low blast-radius action classes.

Today, Panacea workflows operate at L1–L2. Workflows graduate toward L3 as they prove sustained accuracy.

## Extensibility & Plug-in Model

Three self-service extension points:
- **Data** — Teams register signals and data sources into a shared catalog. The system monitors them automatically.
- **Models** — Teams bring their own issue detection models with a standardized contract. Framework handles orchestration, cohort management, and notification.
- **Analyzers** — Teams register diagnosis workflows (prompts, skills, agents, runbooks). Framework provides evidence and orchestration; teams provide domain expertise.

## Key Integrations

- **Device OS (Kanto/Mercer)** — Four new detection models for stability issues (black screens, foreground app crashes, LMK crashes, connectivity crashes). Training on Callie (Vega-based Fire TV Stick) data for Kanto/Mercer platforms.
- **LEDA (Alexa diagnostic analysis)** — Alexa's diagnostic workflows integrated against collected evidence.
- **Fire Lens (Fire TV 3P app quality)** — Customer review analysis models for third-party app quality issues.
- **Customer Service (Fire TV and Appstore)** — Signal plug-ins from customer contacts/reviews; CS agents consume diagnoses.

## Improvement Mechanisms

1. **Knowledge accumulation** — Every resolved issue adds root cause, diagnostic path, and resolution to a shared knowledge base.
2. **Expert curation** — Domain experts contribute runbooks, diagnostic workflows, and analyzers.
3. **Workflow refinement** — Teams adjust diagnostic strategies based on failures.

## Safety Design

- False positives trigger investigation, not action — no wrong fix ships.
- Detection models report capability and reliability metrics; regressing models are automatically gated.
- Diagnosis is non-destructive (read-only queries).
- Code fixes require human approval via standard code review.
- Most promising candidate for fully autonomous action: pausing an OTA deployment (lowest-risk intervention).
- Code fixes and rollbacks go through existing deployment guardrails (code review, build, staged rollout, canary, ramp).

## Current Metrics

- 3,024 developers using Panacea
- 109,000+ agentic workflows for diagnosis
- Diagnosis cost: $0.80–$1.20 per issue
- Remediation cost (code change + CR + addressing comments): $8–$10

## Outcome Metrics Being Tracked

- Mean time to detection
- Mean time to diagnosis
- Mean time to remediation
- Diagnosis accuracy
- Fix acceptance rate

## What's Next (Roadmap)

1. **Broaden Coverage** — Onboard domain-specific detection models, diagnosis workflows, and knowledge bases. Developer workshops planned in Seattle, Bengaluru, Chennai, and Beijing (June 2026).
2. **Close the Remediation Loop** — Automate reproduction on device test farms, apply fix, validate through retesting, monitor restoration of customer experience after deployment.
3. **Shift from Agent-Assisted to Autonomous** — Graduate workflows from L1–L2 to L3 (fully autonomous, event-driven resolution).

## Technology Enablers

- LLM foundational models with stronger reasoning and larger context windows (Claude Opus 4.7, Gemini 3.x)
- Specialized coding-focused products (Amazon Kiro, Claude Code, OpenAI Codex)
- Event-driven framework with AI agents that pick up context from codebases, specs, and curated knowledge bases without explicit fine-tuning

## Top Adopting Orgs (by VP)

| VP | Org | Users |
|---|---|---|
| Aidan Marcuss | FTV - Experience | 455 |
| Volker Schildwach | SW-Device OS | 227 |
| Charlie Ward | SW-Device Services & OPs | 218 |
| Prakash Iyer | Alexa Endpoint Experiences | 204 |
| Kevin Keith | Amazon Device Products - Tahoe | 184 |
| Daniel Rausch | Alexa & Echo | 171 |

## User Personas

- **Domain Experts & Engineers** — Contribute expertise once; system applies it across the fleet continuously.
- **End Customers** — Proactive issue resolution before customers notice; customer-reported issue to fix in minutes.
- **Launch & Support Teams** — Start with answers (what failed, why, which code path, resolution steps). Problems found for them, not by them.

# SDM Interview - Case 2: Dive Deep Analysis

## Question
Walk me through a big problem or issue in your organization that you helped to solve. How did you become aware of it? What information did you gather? What information was missing and how did you fill the gaps? Did you do a reflection at the conclusion of the project? If so, what did you learn?

---

## Narrative Summary

The candidate described a scenario from their time at Nike involving the team's use of AWS EKS (Elastic Kubernetes Service). They observed that approximately 15% of overall engineering capacity was being consumed by EKS maintenance work, including patching, updates, and fixes, which against a standard 20% KTLO allocation was nearly exhausting the team's non-feature bandwidth. The problem was particularly acute for their team because, unlike other groups in the org that had dedicated DevOps organizations, the candidate's team was primarily Node.js-focused with no in-house DevOps expertise. While the candidate framed it as a broader org-wide concern, they were clear that the most direct impact was on their own team's feature delivery velocity. The candidate identified AWS ECS as a more maintainable alternative and ran a proof of concept in a lower environment, gathering metrics on maintainability, security posture, and scalability. They then presented the findings to principal engineers via a document, which the candidate did not author themselves but drove the communication and technical discussion around. The pitch was anchored in a feature-first philosophy and a standardization argument, since EKS had accumulated a sprawl of third-party plugins used inconsistently across teams. Leadership pushed back with hard questions on the why and on the level of effort other teams would incur to migrate. To address this, the candidate designed a deliberately gradual migration approach: no lift-and-shift, parallel operation of EKS and ECS during transition, and a phased cutover. They personally owned the traffic management architecture at ~18M requests per hour, validated ECS scalability empirically, and produced reusable Terraform scripts that other teams could pull and parameterize for their own migrations. Over 2.5 months, 8 teams migrated from EKS to ECS with full cutover. The candidate captured the philosophy with the analogy "you don't need a Ferrari to drive through a rough road," positioning maintainability and feature velocity as the deciding factors over EKS's richer feature set. They also noted that no team had hard third-party dependencies on EKS, which removed a potential blocker. When asked what they would do differently in hindsight, the candidate reflected that they would have started by considering other teams' perspectives more deeply, specifically what value EKS was providing them and how they were using it, before driving toward the migration.

---

## Behavioral Assessment

The candidate demonstrates strong technical Dive Deep instincts, including quantifying the problem early (15% capacity vs. 20% KTLO ceiling), running a POC with metrics, designing a de-risked migration strategy through parallel-run rather than lift-and-shift, and validating scalability at meaningful production scale (18M requests/hour). The leverage thinking shown through reusable Terraform scripts is a positive senior-level signal, as is the willingness to own communication and architecture even when not the formal author of the proposal document. The delivery outcome of 8 teams migrated in 2.5 months with full cutover is concrete and credible. However, the response under-indexes on the specific dimensions the question is probing. The Dive Deep prompt explicitly asks what information was missing and how gaps were filled, and the candidate did not walk through this arc explicitly, instead structuring the answer as a migration execution story rather than an investigation-and-discovery story. The ambiguity around the proposal document ("I was not the author but drove the communication") leaves the candidate's specific contribution unclear and is the kind of phrasing that invites probing follow-ups at the SDM level. The reflection on what they would do differently is honest but somewhat surface-level, and ironically validates a real concern with the Ferrari analogy, which risks sounding dismissive of teams that may have had legitimate reasons to use EKS. A stronger reflection would tie the lesson to a specific moment of friction or rework during the 2.5-month migration and articulate a mechanical change for next time, such as a stakeholder discovery phase before the POC. The candidate also did not surface any learning that emerged from execution itself, such as what surprised them, what broke, or what they would tell a peer running a similar migration today. Overall, the candidate shows genuine technical depth, leverage mindset, and ownership beyond their formal scope, but the storytelling discipline and the explicit articulation of the dive-deep arc, including unknowns, investigation, and learning, fall short of what the SDM bar expects. The technical substance is there; the narrative structure is not.

---

## Behavioral Data Analysis

### Competency: Dive Deep

| Dimension | Observation |
|-----------|-------------|
| **Problem Identification** | Quantified the issue early (15% capacity vs. 20% KTLO budget). Connected operational burden to feature delivery delays — a clear business framing. |
| **Information Gathering** | Conducted a POC in lower environment with metrics. Compared EKS vs. ECS on maintainability, security, and third-party plugin sprawl. Assessed cross-team plugin dependencies before committing to migration. |
| **Gap Identification** | Recognized leadership's concern about LOE for other teams and addressed it by producing reusable Terraform scripts. Identified standardization as a parallel driver beyond just their team's pain. |
| **Technical Depth** | Demonstrated architectural ownership: handled traffic management at 18M req/hr scale, designed parallel-run migration strategy to de-risk cutover, validated ECS scalability empirically. |
| **Influence & Communication** | Drove communication on the proposal doc despite not authoring it. Navigated a "hard conversation" with principal engineers on the *why*. Framed trade-offs in business terms (feature velocity, KTLO burden). |
| **Execution & Delivery** | 8 teams migrated in 2.5 months with full cutover — strong delivery outcome. Reusable Terraform scripts show leverage thinking beyond own team. |
| **Reflection** | Self-aware reflection: would have started with other teams' perspectives on EKS value before pushing migration. Reasonable but not deeply insightful. |

### Strengths Observed
- Strong quantitative framing of the problem (15% capacity, 20% KTLO ceiling, 18M req/hr scale, 8 teams, 2.5 months)
- De-risked migration design: parallel-run strategy, gradual rollout, no lift-and-shift
- Leverage mindset: built reusable Terraform scripts so other teams could self-serve
- Took ownership of communication and architecture even when not the doc author — shows initiative beyond formal scope
- Clear technical depth on the migration mechanics (traffic management, scalability validation)

### Concerns Observed
- The narrative is technically rich but storytelling is rough — many sentence fragments, jumps between motivation, technical detail, and outcomes without smooth transitions
- "I was not the author of the doc but drove the communication" — somewhat ambiguous on what the candidate's specific contribution was vs. the doc author's. SDM interviewers will probe this.
- The "Dive Deep" prompt specifically asks about *information that was missing and how gaps were filled*. The candidate touched on cross-team plugin dependencies and LOE, but didn't explicitly walk through what they didn't know upfront and how they investigated to fill those gaps. The dive-deep arc is implicit rather than explicit.
- The reflection ("think from others' perspectives, what extra was EKS giving") is a reasonable lesson but somewhat surface-level. A stronger answer would tie the lesson to a specific moment in the project where this perspective gap caused friction or rework, and what they'd do mechanically differently next time.
- The "you don't need a Ferrari to drive through a rough road" analogy is memorable but risks sounding dismissive of teams that may have had legitimate reasons to use EKS — and the candidate's stated reflection actually validates this concern.
- Limited discussion of what could have gone wrong, what risks they tracked, or what learning came out of the migration itself (e.g., did anything break? what surprised them?)

---

## Rating: Meets Bar (with reservations)

**Rationale:** The candidate demonstrates genuine Dive Deep behavior — they quantified the problem, ran a POC with metrics, designed a thoughtful migration strategy, and delivered a measurable outcome (8 teams in 2.5 months at 18M req/hr scale). The leverage thinking (Terraform scripts) and de-risking approach (parallel-run) are positive senior-level signals. However, the response under-indexes on the specific dimensions the question asks about: *what information was missing* and *what was learned*. The candidate's answer is more of a "how I led a migration" story than a "how I dove deep into a complex problem" story. The reflection is honest but shallow, and the storytelling lacks the polish expected at the SDM level. The technical substance is there; the narrative discipline and explicit articulation of the dive-deep arc are not. With sharper framing — explicitly walking through the unknowns, the investigation, and the lessons — this would be a clear strength. As delivered, it's a solid but not standout answer.

---

## Coaching Points for Candidate

1. **Lead with the dive-deep arc, not the migration arc.** Restructure as: (a) what I noticed, (b) what I didn't yet understand, (c) how I investigated, (d) what I found that surprised me, (e) what I did with that insight, (f) outcome, (g) reflection.
2. **Be explicit about gaps.** Name 1-2 things you didn't know going in (e.g., "I didn't know if other teams had production-critical EKS features we'd lose") and how you investigated.
3. **Sharpen the reflection.** Tie the "think from others' perspective" lesson to a concrete moment — was there pushback you didn't anticipate? Did a team flag a use case you'd missed? What's the mechanical change you'd make next time (e.g., a stakeholder discovery interview before the POC)?
4. **Clarify your contribution on the doc.** "I drove the technical sections and the migration strategy; [author] led the framing for the principal review" — give the interviewer a clean read on your scope.
5. **Add a learning that came from execution itself,** not just from the planning phase. What surprised you during the 2.5 months? What would you tell a peer running a similar migration now?

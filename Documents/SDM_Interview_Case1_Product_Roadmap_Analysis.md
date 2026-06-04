# SDM Interview - Case 1: Product Roadmap Analysis

## Question
Tell me about a time you had to define a product roadmap with competing priorities from multiple stakeholders. How did you decide what to prioritize and what to cut? How did you communicate the trade-offs to stakeholders who didn't get what they wanted?

---

## Narrative Summary

The candidate described a scenario from November of the previous year involving CAPS, a Billing and Retail tool. Their team was managing multiple concurrent workstreams: maintaining a revenue-generating Version 1 product ($4-5M/year) while building Version 2, delivering a data retrieval project, and executing a supply chain management project — all classified as P0. When a competing priority emerged (one team needed to go live using their API while storing data in S3, which was an enhancement rather than a mission-critical ask), the candidate conducted an impact analysis. They used Claude to analyze the codebase and identify which product segments would experience delays. They then partnered with the BI team to quantify the cost of delay, discovering that not prioritizing the supply chain task would result in a ~$500K/day impact on dairy product sales (300-400 units/day). Armed with this data, the candidate presented a cost-based prioritization rationale to leadership, clearly articulating what was being deprioritized and why, while assuring stakeholders that later milestones would remain on track. They performed resource reshuffling and leveraged a 15-20% buffer they routinely build into delivery plans. The candidate led all stakeholder communications directly (as the team lacked dedicated program or product managers), successfully delivering the high-priority project while still meeting timelines for the deprioritized work through buffer management. When asked about scenarios where even the buffer wouldn't suffice, the candidate described a proactive communication approach: immediate heads-up to impacted stakeholders, transparent reasoning, and a follow-up meeting to discuss alternate plans.

---

## Behavioral Data Analysis

### Competency: Product Roadmap

| Dimension | Observation |
|-----------|-------------|
| **Prioritization Framework** | Used a P0-P4 classification system and evaluated against LEOs (likely effort/outcome). Anchored decisions in revenue impact and quantified cost of delay ($500K/day). |
| **Stakeholder Management** | Led communication directly to stakeholders and leadership. Presented data-driven rationale for trade-offs. Assured deprioritized stakeholders that later milestones would hold. |
| **Strategic Thinking** | Demonstrated ability to balance short-term urgency (supply chain) against long-term product evolution (V1→V2 migration). Built in structural buffers (15-20%) as a planning discipline. |
| **Data-Driven Decision Making** | Partnered with BI team, used quantitative cost analysis, and presented financial impact to leadership to justify prioritization. |
| **Execution & Delivery** | Resource reshuffling, buffer utilization, and milestone tracking enabled delivery on both the critical and deprioritized workstreams. |
| **Communication** | Proactive, transparent communication style. Framed trade-offs in business terms leadership could act on. |

### Strengths Observed
- Strong quantitative approach to prioritization (revenue impact, cost of delay)
- Proactive stakeholder communication without being prompted
- Structural planning discipline (buffers, milestone mapping, dependency tracking)
- Stepped up beyond their engineering manager scope to own product roadmap and prioritization in absence of PM/PgM — demonstrates ownership and leadership initiative

### Concerns Observed
- Initial clarifying question ("is this about how I managed prioritization or planning of QoQ work?") suggests the candidate needed framing before diving in — minor signal of needing structure from the interviewer
- The narrative was somewhat scattered and non-linear; candidate jumped between multiple projects without always clearly connecting them into a cohesive story
- The use of Claude for codebase analysis is interesting but the candidate didn't clearly articulate *their own* analytical reasoning separate from the tool's output
- The team was newly formed in November, which limits the track record of sustained roadmap ownership over multiple cycles
- The $500K/day figure and dairy product context felt somewhat disconnected from the CAPS billing tool framing, making it harder to follow the through-line of the story

---

## Rating: Mild Concern

**Rationale:** The candidate demonstrates awareness of prioritization mechanics (P0-P4, cost of delay, stakeholder communication) and shows initiative in stepping up beyond their engineering role to own product roadmap decisions when the team lacked a PM/PgM — a positive ownership signal. However, the response lacks the structured, crisp storytelling expected at the SDM level. The narrative jumps between multiple projects without a clear through-line, and the candidate's personal strategic contribution is somewhat obscured by tool usage (Claude). The quantitative analysis ($500K/day impact) is a strength, but the overall answer reads more as a collection of tactical actions than a demonstration of strategic product roadmap ownership. For a senior leadership role, one would expect a more cohesive narrative showing end-to-end ownership of roadmap definition, clearer articulation of the framework used to make trade-off decisions, and more polished stakeholder influence at scale.

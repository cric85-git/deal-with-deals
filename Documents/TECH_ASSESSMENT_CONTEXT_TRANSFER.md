# Tech Assessment — Context Transfer & Progress Log
## Last Updated: April 16, 2026

---

## DOCUMENT STATUS
**File:** `Documents/Shail_Bhatt_Tech_Assessment_L7_PTPM.md`

### What's Complete:
- ✅ **Work Summary 1 — Panacea (Anchor Story)** — Fully written with all context incorporated
- ✅ **Work Summary 2 — Minerva Migration & DCM Deprecation** — Fully written with all context incorporated
- ✅ **Work Summary 3 — VP-Level Metric Transport Convergence** — Fully written with VCA + Ceviche details
- ✅ **Additional: Arcus Client Auth & Quattro Observability** — Fully written with email evidence
- ✅ **Additional: Bandwidth Reduction MLP** — Fully written with 2023 + 2024 goals
- ✅ **Additional: Technical Assessment & Mentorship** — Written (Deepak Bhauwala assessment + SDM coaching pattern)

### What Still Needs Input:
- ❌ **Steam Member** and **Steam Direct** names
- ❌ **Feedback Providers** (5–7 names with alias, role/level, project context)
- ❌ **Interviewees** (3–5 names, subset of feedback providers)
- ❌ **Panorama MLP** details (scope, role, outcomes) — still placeholder
- ❌ **Panacea current customer count** (beyond 500+ at launch) — as of April 2026
- ❌ **Artifact links** — most are filled, a few `[INSERT LINK]` remain (Decision Log, Action Items Tracker, DSLT Goal Tracker, Product Day Template)
- ❌ **Wordsmithing pass** — user wants to refine language across all sections

---

## KEY NARRATIVE ARCS ESTABLISHED

### Arc 1: Panacea — The Anchor Story
- **May 2025:** Madhur moved Shail from Metrics/Minerva to Logs/Crashes/Troubleshooting. Took over from Kevin Clinton. Email artifact: "Shail has been super successful as the TPM lead for Minerva"
- **No SDM for all of 2025** — wore TPM + SDM hats simultaneously
- **Partnered with PE Young Kim** on e2e infrastructure delivery
- **Brought alignment across 3 domains:** Logs, Crashes, S&D — operating independently, unified under single delivery plan
- **9 workstreams, 100+ milestones, 15+ engineers, 878 wiki revisions** (Launch Readiness Tracker owned by Shail)
- **Serverless architecture:** ECS Fargate, EventBridge, DynamoDB, AppSync, OpenSearch, Lambda, Kinesis — all CDK IaC
- **6 capabilities at launch:** OTA anomaly detection (5 issue types), automated log uploads, customer journey analytics, GenAI log analysis, Crash Console integration, Crashboard integration
- **Completed 12/18/2025** — 13 days ahead of 12/31 deadline
- **500+ customers in first 3 weeks**
- **OTA team using SNS topics for Sev-2 tickets by 8/25** — pre-launch
- **Early access customers:** L7 POCs across all PLs (Karl Jonsson FTV, Vova Tymoshchuk Device OS, Naren Gunasekaran Tablets, Bala Kumar Echo)
- **2026 expansion:** Device OS partnership (Biju deep dives), 4 new detection models, 3 MCPs, Kanto/Mercer support, Product Day with Panos (5/28/2026, 60 min, 20+ L8-L10 leaders)
- **Bala Kumar (VP)** quote: "I just knew you guys would have done even more than I expected"
- **Crash anomaly detection:** 30 applications, ~164K daily alerts, 2,816 high-risk issues/month
- **Manager quote:** "Panacea was an L7-scoped challenge"

### Arc 2: Minerva Migration & DCM Deprecation
- **Joined Amazon May 2021** — immediately handed this program with no SDM
- **Wore SDM + TPM hats from day one** — daily standups with SDEs building Minerva clients
- **Scale:** 8T metrics/day, 69K unique programs, top 100 = 92% volume, 50+ program names, 5+ product lines, multiple OS (iOS, Android, FOS, Vega, RTOS, ACS)
- **Authored 3 key strategy docs:** Minerva Strategy, DCM Deprecation Plan, "Where is my DCM Metric?" product requirements
- **Built tracking dashboard** and top-100 program tracker
- **Coached 2 SDMs:** one in Apr 2022 (helped ramp), she left Mar 2024, then helped Sr. SDE Nathan grow into interim SDM → permanent role
- **Results:** 295T→99.38T metrics (66.34% reduction, exceeded 60% target), $13.5MM→$9.43MM AWS cost ($4.07MM savings, 30%, exceeded 10% target by 3x)
- **2024:** Weekly traffic 18.4T→2.6T (86% reduction)
- **mShop:** 30 teams, 24 migrated, 6 deprecated, zero metric loss
- **FOS7 Tablets:** Identified 2.9% metric loss, drove RCA across 3 factors, coordinated hotfix
- **Deprecation strategy:** block-and-store, remote blocklisting, bloom filter allowlisting, stub/no-op clients, server-side forwarding for legacy devices
- **9 artifact links** in the doc

### Arc 3: VP-Level Metric Transport Convergence
- **VCA-to-Minerva (Kingpin: 957146, STL: Shail)** — authored convergence path doc, L8 sign-off from Luis Romero and Van Hasty on 5/7/25
- **VCA scale:** 890B events/day aggregated from 69B raw metrics via KDM
- **Core technical challenge:** VCA hourly persistent aggregation vs. Minerva app-controlled model
- **Follow-on workstreams:** Enhanced Minerva aggregation (min/max, histogram, pre-aggregated data — feature complete 5/19), Minerva RTOS client for ACK 3P devices
- **Ceviche-to-Minerva:** Drove L8 goal alignment with dedicated LR tracker

### Arc 4: Arcus Client Auth & Quattro Observability
- **Another SDM transition** — existing SDM moving out, new SDM stepping in
- **Worked with 3 new SDEs** to complete red-certification
- **4 ASRs:** 3 Client (C++, ACS, TurboModule) + 1 Cloud
- **First-ever client-to-service authentication** for Arcus — traffic never authenticated before
- **Daily status updates to Charlie Ward (L8) and Luis Romero (L8)**
- **3 client ASRs completed 2 weeks ahead of schedule** (12/5 vs. planned 12/18)
- **Cloud ASR on schedule** (12/20)
- **Charlie Ward quote:** "Great news, team! And yes, thank you to all for the focus and work to get this done!"
- **Client-to-Service Auth:** HLD (11/4) → LLD (11/14) → Dev complete (2/10/25) → QDK 11.2.3 HotFix (code freeze 2/24/25)
- **Quattro Observability SPOC:** Coordinated Metrics, Logs, Crashes, Troubleshooting workstreams

### Arc 5: Bandwidth Reduction
- **Sole SPOC, no dedicated resources** — driven in parallel with Minerva
- **Partnered with Device Farm SDE/SDET** to build 24-hour bandwidth test capability
- **2023:** Presented to leadership 4/11/23, delivered MLP (tcpdump, Device Farm, Loom, dashboards), Fire TV pilot by 12/30/23
- **2024:** Exceeded goal 7.7x — 23 devices (target was 3) covering 90%+ MAU across Fire TV (11), Tablets (7), EFD (5)
- **Per-process bandwidth via Skim** support for 91% MAU EFD, 90% MAU FTV, 92% MAU Tablets
- **Co-authored program doc, created wiki, established MBR cadence** for PL leaders

### Arc 6: Technical Assessment & Mentorship
- **Tech assessor for Deepak Bhauwala** L5 PM → L6 Sr. TPM (Nov 2025), selected by L7 Aman Balahara
- **Evaluated 8 work samples** spanning passwordless impact analysis (14 PLs), AWS SA cert, L10-level influence, DEM architecture, Peak Readiness (200+ services)
- **Assessment was instrumental** in Deepak's successful promotion
- **Pattern:** Coached 2 SDMs (Minerva), placeholder SDM (Panacea), worked with 3 new SDEs (Arcus)

---

## CROSS-CUTTING THEMES FOR L7

1. **SDM gap filler** — Every major program had an SDM transition; Shail stepped in every time (Minerva 2021, Minerva 2022/2024, Panacea 2025, Arcus 2024)
2. **Multi-program capacity** — Ran Minerva + Bandwidth simultaneously; ran Panacea + Arcus + Quattro Observability simultaneously
3. **Strategy author** — Wrote the Minerva Strategy, DCM Deprecation Plan, "Where is my DCM Metric?" requirements, VCA Convergence Path, Bandwidth program doc
4. **L8+ communication** — Daily updates to Charlie Ward, bi-weekly Minerva reviews for L8+, Product Day with Panos (L10+)
5. **Exceeds targets** — 60% target → 66.34% (Minerva), 3 devices → 23 (Bandwidth), 12/31 deadline → 12/18 (Panacea), 12/18 planned → 12/5 (Arcus ASRs)
6. **Develops others** — Coached 2 SDMs, tech assessor for L6 promo, worked with new SDEs during transitions
7. **Performance trajectory** — Meets High Bar (2023) → 3x consecutive Exceeds High Bar (2024-2026)

---

## KEY PEOPLE REFERENCED

| Name | Alias | Role | Context |
|---|---|---|---|
| Madhur Kulkarni | madhurk@ | Manager (L7) | Shail's manager |
| Charlie Ward | ward@ | L8 | Arcus status updates, Product Day invite |
| Luis Romero | lrromero@ | L8 | Minerva reviews, VCA convergence sign-off |
| Van Hasty | | L8 | VCA convergence sign-off |
| Tapas Roy | tapas@ | L8+ | Product Day invite sender |
| Panos Panay | | SVP | Product Day 5/28/2026 |
| Matt Miller | millerfd@ | L7 | DAS management, Product Day template feedback |
| Jared Kopczynski | kopski@ | Sr. PMT | Panacea PM, Product Day WorkDoc owner |
| Young Kim | youkm@ | PE | Panacea infrastructure, Arcus design |
| Vishal Chandak | vcchanda@ | SDM | Troubleshooting Console owner |
| Biju Balakrishna Pillai | biju@ | Device OS | Deep dive sessions, Kanto/Mercer |
| Bala Kumar | | VP (Project Hagrid) | "I just knew you guys would have done even more than I expected" |
| Kevin Clinton | | Previous TPM | Shail took over Panacea from him May 2025 |
| Aman Balahara | balahara@ | L7 | Selected Shail as tech assessor for Deepak |
| Deepak Bhauwala | | L5→L6 | Tech assessment subject |
| Nicholas D'Aquila | | SDE | Panacea Orchestration Service |
| Nathan Huff | nhuff@ | Sr. SDE | Grew into SDM role with Shail's coaching |
| Thomas | | Applied Scientist | Anomaly detection models |
| Harish Javvaji | | DE | Customer Journey, KPI forecasting |
| Danny Pham | | UX | Panacea console design |
| Hitesh Jain | hitesja@ | SDM | Logs UI, encrypted log pull |
| Siva Janakiraman | | SDE | Crashboard integration |

---

## ARTIFACT LINKS COLLECTED

### Panacea
- Launch Readiness Tracker 2025: https://wiki.labcollab.net/confluence/display/NetCom/Panacea+-+Launch+Readiness+Tracker
- Launch Readiness Tracker 2026: https://wiki.labcollab.net/confluence/display/NetCom/2026+Troubleshooting+Suite+-+Launch+Readiness+Tracker
- Prod Dashboard: https://panacea.loom.devices.amazon.dev/

### Minerva
- Minerva Strategy: https://quip-amazon.com/ZaqkA85TaahF/Minerva-Strategy
- DCM Deprecation Plan: https://quip-amazon.com/z836A6pmhvM7/Device-Client-Metrics-DCM-Deprecation-Plan
- 2023 Migration Plan: https://quip-amazon.com/b3hHApdyrtFt/2023-Minerva-Migration-Plan
- "Where is my DCM Metric?" Requirements: https://quip-amazon.com/wH0UAvHhnmma/Where-is-my-DCM-Metric-Tool-requirements
- DCM Deprecation Workstreams: https://wiki.labcollab.net/confluence/display/NetCom/DCM+Deprecation+Plan+Work-streams
- Metrics Usage Dashboard: https://w.amazon.com/bin/view/MobileDiagnostics/Platform/Metrics/MetricsUsage/
- DCM Tracker (Top 100): https://beta.sourcewall.ds2.amazon.dev/metricsummary/Minerva%20Migration%20DCM%20Tracker%20%5BBETA%5B
- Migration Issue Tracker: https://wiki.labcollab.net/confluence/display/NetCom/Minerva+Migration+Issue+Tracker
- 2023 Status Tracker: https://wiki.labcollab.net/confluence/display/NetCom/2023+Minerva+Migration+Status+Tracker

### Convergence
- VCA-to-Minerva Convergence Path: https://quip-amazon.com/j6FCA6yqpOKF/Minerva-VCA-Aggregation-Convergence-Path
- Ceviche-to-Minerva LR: https://wiki.labcollab.net/confluence/display/NetCom/LR+-+Ceviche+to+Minerva+Convergence

### Arcus & Quattro
- Observability for LR: https://wiki.labcollab.net/confluence/display/NetCom/Observability+for+LR
- DS2 Observability Workstreams for Quattro: https://wiki.labcollab.net/confluence/display/NetCom/DS2+Observability+work-streams+for+Quattro
- JIRA Dashboard: https://issues.labcollab.net/secure/Dashboard.jspa?selectPageId=91523

### Bandwidth
- Bandwidth Reduction Program: https://wiki.labcollab.net/confluence/display/NetCom/Bandwidth+Reduction+Program
- 2024 Goal: https://wiki.labcollab.net/confluence/display/NetCom/2024+Bandwidth+Reduction+Goal
- Program Document (WorkDocs): https://amazon.awsapps.com/workdocs-amazon/index.html#/document/bcdb6cc88805a030e1e9f1e4c8fa6fed91d69bd12b28099b59faf9c9a4736be6
- Wiki & MBR: https://w.amazon.com/bin/view/DeviceAnalyticsServices/DeviceBandwidthReduction

---

## NEXT SESSION PRIORITIES
1. User to provide Panorama MLP details
2. User to provide Feedback Providers and Interviewees
3. User to provide Steam Member / Steam Direct names
4. User to provide current Panacea customer count (April 2026)
5. User may bring additional reference documents
6. **Wordsmithing pass** — align language to L7 Principal TPM Role Guideline criteria (see below)
7. Remaining artifact links to fill

---

## L7 PRINCIPAL TPM ROLE GUIDELINE — KEY CRITERIA TO MAP

Source: `Technical-Program-Manager-Role-Guideline (3).docx` (January 2020, Version 3.0)

### "Moving to Principal TPM" Criteria (Section 4.3):
Each criterion below is mapped to Shail's evidence.

| # | Criterion | Shail's Evidence |
|---|---|---|
| 1 | **Manage important technology programs with broad cross-organizational and/or cross-business impact. Define requirements, negotiate priorities, deliver the right solutions and mechanisms.** | Panacea (9 workstreams, 3 PLs, 15+ engineers, DSLT goal), Minerva (50+ programs, 5+ PLs, 8T metrics/day), Convergence (3 metric services → 1), Bandwidth (3 PLs, 23 devices) |
| 2 | **Resolve significantly complex problems and provide long-term beneficial impact. Solutions are as simple as possible.** | Panacea: unified troubleshooting from scratch. Minerva: phased migration strategy with block-and-store, bloom filter allowlisting. DCM Deprecation Plan: server-side + client-side strategy. PRFAQ: diagnostic ledger concept |
| 3 | **Contributions are noteworthy and recognized inside and outside your organization.** | 500+ customers in 3 weeks (Panacea). Product Day with Panos (SVP). Bala Kumar (VP) sponsorship. Charlie Ward (L8) praise. Device OS partnership (Biju). OTA team using SNS topics pre-launch |
| 4 | **Operate with autonomy, showing high judgment in decisions that have technical and business implications.** | Took over Panacea mid-flight with no SDM, wore TPM+SDM hats. Sole SPOC for Bandwidth with no resources. Authored Minerva Strategy and DCM Deprecation Plan. Made ship-early-iterate-later decision on detection model |
| 5 | **Identify and tackle intrinsically hard problems (highly complex, ambiguous, little existing structure, significant risk).** | Panacea: no prior unified troubleshooting platform existed. Minerva: 69K programs with no ownership concept. VCA convergence: reconciling two fundamentally different aggregation models. PRFAQ: defining cross-domain diagnosis from scratch |
| 6 | **Represent complex decisions, tough trade-offs, and potential solutions clearly to leaders up to 3 levels above.** | Daily status updates to Charlie Ward (L8). Bi-weekly Minerva reviews for L8+. Product Day presentation to Panos (SVP/L10+). PRFAQ reviewed by 7 L8s. VCA convergence signed off by 2 L8s |
| 7 | **Adept at building consensus. Align teams toward coherent technology strategies. Bring clarity to complexity.** | Unified Logs/Crashes/S&D under single delivery plan. Drove VCA-to-Minerva convergence with competing teams. Brought 40+ teams to migrate from DCM. Device OS deep dives leading to 4 new models + 3 MCPs |
| 8 | **Flexible, adapting approach to meet needs of project teams.** | Wore SDM hat when no SDM (3 times). Partnered with Device Farm SDE/SDET for Bandwidth. Stepped in as tech assessor. Coached SDMs into roles |
| 9 | **Actively recruit and participate in hiring/interview process.** | _[TO BE CONFIRMED — likely yes but not yet documented]_ |
| 10 | **Significant role in career development of others. Mentor, perform Principal TPM promo assessments.** | Coached 2 SDMs (Minerva). Tech assessor for Deepak L5→L6 promo. Worked with 3 new SDEs (Arcus). Placeholder SDM developing engineers (Panacea) |
| 11 | **Exemplary practitioner of technical project and program management.** | 878-revision Launch Readiness Tracker. 9 workstreams with phased milestones. Minerva Strategy + DCM Deprecation Plan + PRFAQ. MBR cadence for Bandwidth. Bi-weekly migration reviews |

### L7 Principal TPM Level Matrix Dimensions:

| Dimension | L7 Expectation | Shail's Evidence |
|---|---|---|
| **Ambiguity** | Business and architectural strategy may not be defined. May not know what the problem is before starting. Drives clarity. Delivers with complete independence. | Panacea: no prior platform existed. PRFAQ: defined cross-domain diagnosis from ambiguity. Minerva: no ownership concept in DCM |
| **Scope and Influence** | Works across VP orgs. Broad strategic influence. | Minerva: 40+ teams across multiple VPs. Convergence: across Luis Romero + Van Hasty orgs. Product Day: Panos (SVP). PRFAQ: reviewed by 7 L8s across 6 orgs |
| **Advises** | VPs | Product Day with Panos. Bala Kumar (VP) sponsorship. PRFAQ reviewed by L8s reporting to multiple VPs |
| **Execution** | Owns a very large program. Manages significantly complex cross-functional technology initiatives. Work is strategic. Effectively force multiplies. Manages escalations (is escalated to). | Panacea: 9 workstreams, 100+ milestones, DSLT goal. Minerva: 4-year, 50+ programs. Convergence: VP-level strategy. Force multiplied by coaching SDMs, stepping in as SDM |
| **Impact** | Multiple org goals and program-related metrics. | Panacea (DSLT goal), Minerva (DSLT goal), Convergence (VP goal), Bandwidth (Kingpin goals across 3 PLs), Arcus (Quattro certification) |
| **Technical** | Able to identify risks/opportunities in technical strategies, architecture(s) and/or engineering organization structure(s). | Partnered with PE Young Kim on Panacea infrastructure. Authored VCA convergence path (aggregation model analysis). Identified FOS7 metric loss across 3 root causes. Drove Minerva client feature parity across 5 platforms |
| **Process Improvement** | Aligns teams and orgs toward simple, coherent approaches. Creates/optimizes cross-org structures and mechanisms. | Unified 3 domains under single delivery plan (Panacea). Created Launch Readiness mechanism (878 revisions). Established MBR for Bandwidth. Built "Where is my DCM Metric?" self-service tool. Created bi-weekly migration review mechanism |

---

## ADDITIONAL CONTEXT ADDED (Late Session 4/16)

### PRFAQ — Integrated Device, App and Service Troubleshooting Analytics and Insights
- **Authored by Shail in Q1 2026** — expands Panacea into cross-domain diagnosis
- **Core concept:** Unified, time-ordered diagnostic ledger stitching logs, crashes, user interactions (Panorama), cloud service logs (Atocha), customer support data, Jira/SIM tickets, measurement events, system-level traces
- **North Star:** Make failures invisible to customers, reduce MTTR from days to hours
- **Key technical concepts:** Adaptive collection, domain-specific analyzers (prompt-based, no traditional code), federated analyzer model, progressive attribution, plugin-based extensibility
- **Integration points:** Troubleshooting AI Agent (Kiro CLI/IDE), Diagnostic Timeline Viewer, Loom Troubleshooting Suite, agent-to-agent integration
- **Data sources at launch:** Device/app logs, crashes, user interactions (Panorama), cloud service logs (Atocha), customer support call data, Jira/SIM tickets, measurement/diagnostic events, system activities (network/function calls, memory/storage)
- **Analyzer architecture:** First-class citizens that can invoke other agents, call MCPs/external tools, chain reasoning steps — federated model where domain teams extend diagnostics
- **LEDA partnership:** POC where LEDA analyzers run against shared diagnostic context on Panacea framework
- **Review process (3 months):**
  - 1/12-1/26: 6 stakeholder interviews (Kyle Grunwald, Vova Tymoshchuk Device OS, Barry Jordan PE, Biju Pillai Device OS, Jamie Meyers PE, Jeremy Dimasuay Alexa SDM)
  - Key finding from interviews: Cross-domain diagnosis and data correlation across fragmented systems remain key challenges
  - 2/2: DAS team review (Luis, Madhur, Matt, Jared, Vishal, Hitesh, Nathan, Anindya, Joel)
  - 2/18-3/9: PE follow-ups (Jamie Meyers 2/18, Barry Jordan 2/19, Val Vanderschaegen 2/23, Biju Pillai 3/9)
  - PE feedback: Aligned with core idea. Emphasized simplifying analyzer/runbook onboarding and delivering accurate root-cause attribution as critical success factors
  - Jamie & Barry: Called out chicken-and-egg problem for initial customers
  - Val: Logzilla's success stemmed from enabling teams to define common events/patterns. Quick identification of major cross-domain events within seconds is key
  - Biju: "This will eliminate the hops between teams. Junior SDEs become multi-domain experts, Sr SDEs become key contributors to domain knowledge"
  - 2/20: LEDA SDM meeting (Vivek) — LEDA does ticket-based triaging with LLM diagnosis, working on crash/metrics POCs
  - 2/27, 3/7, 3/13: DAS Leadership iterative reviews with Luis
  - 3/18: **L8 review and sign-off** — Luis Romero (DS2), Biju Balakrishna Pillai (Device OS), Edward Birch-Jensen (Device OS), Manolo Arana (EFD), Mayur Misra (FTV), Damon Lanphear (eReader), Kimmo Lehtosalo (Tablets), Gustave Hottegindre (Legal)
- **Post sign-off:** Diagnostic ledger now being delivered as part of 2026 LR tracker
- **L7 signal:** Authored PRFAQ for ambiguous problem space, drove through PE + L8 + L10 review, now translating into executable delivery

### Deepak Bhauwala Tech Assessment
- **Date:** November 13, 2025
- **Assessor:** Shail Bhatt (L6 Sr. TPM)
- **Subject:** Deepak Bhauwala — Manager III, Program Mgmt → Technical Program Manager III (Sr. TPM)
- **Manager:** Aman Balahara (L7)
- **Team:** Devices Infrastructure Excellence Team (DIET)
- **Assessment outcome:** YES — supported job family change
- **8 work samples evaluated:** Passwordless impact analysis (14 PLs), AWS SA cert, cross-functional influence at L10, DEM architecture, DEM onboarding (80+ devices, 35+ OTAs, 1000+ milestones), CloudWatch strategy analysis, Panacea metrics issues, Q4 2025 Peak Readiness (200+ services)
- **L7 signal:** Selected as tech assessor by L7 manager for cross-team job family change — recognized as having technical judgment to evaluate L6 TPM candidates

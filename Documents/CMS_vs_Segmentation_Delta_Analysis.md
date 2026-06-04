# CMS vs. Segmentation & Sampling Service — Feature Delta Analysis

**Date:** 4/14/26
**Author:** Shail Bhatt
**Purpose:** Identify capabilities proposed in the Panacea Cohort Management System (CMS) PRFAQ and review it against the proposal in the Population Sampling and Aggregation functional design — to inform what must be accounted for if the two systems converge into a single service.

---

## Context

Two documents propose new infrastructure for managing device populations:

1. **Panacea Cohort Management System (CMS) PRFAQ** — A purpose-built service for tracking groups of devices affected by detected problems, enabling troubleshooting workflows across Anomaly Detection, Issue Detection, Case Management, and Customer Support.

2. **Sampling and Aggregation Functional Analysis** — A system for reducing telemetry footprint by 90% through confidence-based population stratification sampling, enforced pre-storage on devices.

Both systems share a common foundation: grouping devices by shared characteristics (device type, software version, region) and managing membership in those groups. The question is whether they should be one service or two.

---

## Shared Foundation (Already Aligned)

These capabilities exist in both documents and would form the core of a unified service:

| Capability | CMS | Segmentation |
|---|---|---|
| Population stratification by device type, firmware, region | Cohort dimensions | Population strata attributes |
| Device membership tracking (DSN-level) | Membership records | Population samples |
| Sampling from a population group | Sampling API (stratified) | Population Sample Generator |
| Periodic recalculation of groups | Cohort membership updates | Strata recalculation |
| Audit logging | Cohort audit log | Population Audit Event Log |
| Sub-100ms entity lookup | DSN-to-Cohort lookup | Sample Retrieval Latency |
| Extensible dimensions (custom key-value) | Custom dimensions | Population definitions |

---

## Delta: CMS Capabilities Not Covered in Segmentation Doc

### 1. Problem-Driven Cohorts (Affected/Control Paradigm)

**CMS:** Groups devices for troubleshooting — tracking which devices exhibit a detected problem. Cohorts are typed as `affected`, `control`, `composite`, or `investigation-sample`. An affected cohort might contain all devices crashing on firmware 7.6.3, while its paired control cohort contains matched healthy devices for comparison during diagnosis.

**Segmentation:** Groups devices for telemetry optimization — reducing footprint while maintaining statistical confidence. No concept of "affected" vs. "control" or problem-linked grouping.

**Gap:** The Segmentation doc has no concept of "affected" vs. "control" cohort types, or any problem-linked grouping. A unified service would need to support both purposes — statistical sampling groups AND problem-tracking groups — with different membership semantics.

**Action for unified service:** Add a cohort type taxonomy (affected, control, composite, investigation-sample) alongside the existing sampling strata type. The type determines membership semantics and lifecycle behavior.

---

### 2. Temporal Membership Tracking (Observation Windows)

**CMS:** Each membership record contains the DSN, an immutable `first_seen` timestamp, an `occurrence_count` (total separate observation windows), and a bounded set of the most recent non-overlapping observation time ranges. This lets teams distinguish a device affected once from one affected repeatedly, and collect telemetry from the exact time ranges when the behavior occurred.

**Segmentation:** Membership is binary — device is in sample or out of sample, with a rotation TTL (3–7 days). No temporal history.

**Gap:** The Segmentation doc's membership record is binary (in sample / out of sample + TTL). CMS needs `first_seen`, `occurrence_count`, and a bounded buffer of observation time windows per device. A unified service would need to extend the membership record schema to support both the simple TTL model and the temporal observation model.

**Action for unified service:** Extend the membership record schema to support both models. Sampling strata can use the simple in/out + TTL model. Troubleshooting cohorts need `first_seen`, `occurrence_count`, and a bounded observation window buffer.

---

### 3. DSN-to-Cohort Reverse Lookup (CS Path)

**CMS:** A single API call resolves a DSN to every cohort it belongs to, along with linked Issues, in under 100ms at p99. This powers CS associate workflows and AI-enabled self-service systems.

**Segmentation:** Has a similar latency target (100ms) for forward lookup — given a device, get its sampling config. No reverse lookup (given a DSN, return all problems/cohorts).

**Gap:** CMS requires a materialized reverse index (DSN → all cohort IDs + linked Issues). The system maintains a materialized membership index that maps DSNs to cohort IDs. This index updates incrementally as cohort membership changes. Lookups are O(1) against this index, delivering under 100 milliseconds at p99. The Segmentation doc has no equivalent — it only needs to answer "is this device in the sample for this telemetry?" A unified service would need to add this reverse-lookup index and API.

**Action for unified service:** Add a materialized reverse index (DSN → all cohort IDs + linked Issues). The system maintains this index incrementally as membership changes. Lookups are O(1). This is a new API surface (LookupDSN) not present in the Segmentation design.

---

### 4. Cross-Domain Cohort Correlation Keys

**CMS:** Every cohort has a unique identifier and a separate correlation key — a deterministic hash of common dimensions (device family, firmware version, region). Two independent systems that observe the same device population resolve to the same correlation key without coordination. Custom key-value pairs do not affect the correlation key.

**Segmentation:** Strata are defined by system owners for sampling purposes. No deterministic correlation mechanism for cross-system recognition.

**Gap:** The Segmentation doc has no concept of correlation keys. Its strata are defined by system owners for sampling purposes. A unified service would need to add a deterministic correlation key mechanism so that independent systems (Anomaly Detection, Issue Detection, etc.) can recognize they're looking at the same population without coordination.

**Action for unified service:** Add a deterministic correlation key mechanism so that independent systems (Anomaly Detection, Issue Detection, Minerva sampling) can recognize overlapping populations without coordination.

---

### 5. Composite Cohorts (Hierarchical Composition)

**CMS:** When Anomalies are grouped into an Issue, the system creates a composite cohort as the union of all underlying Anomaly cohorts. The composite is a dynamic entity reflecting the current state of all child cohorts at query time. Supports up to 3 levels: Anomaly → Issue → Case.

**Segmentation:** Strata are flat groupings. No hierarchy or composition.

**Gap:** The Segmentation doc has no hierarchy concept. Strata are flat groupings. A unified service would need to support dynamic composite groups that are unions of child groups, evaluated at query time, up to 3 levels deep.

**Action for unified service:** Add a dynamic composition engine that can create union-based composite groups evaluated at query time, supporting up to 3 levels of nesting.

---

### 6. Cohort Lifecycle Management (Active → Resolved → Archived)

**CMS:** Full lifecycle: `active → resolved → archived`. When an Issue is resolved, linked cohorts transition to resolved. After 60 days with no updates, the system archives them — removing from real-time lookups while retaining data for audit. Archived cohorts can be reactivated on demand. Archived membership data retained 12 months, then DSN-level records purged per Policy 97/50725. Aggregate statistics retained indefinitely.

**Segmentation:** No lifecycle states. Strata exist as long as the population definition exists and are recalculated periodically.

**Gap:** A unified service would need lifecycle state management (active/resolved/archived), staleness-based archival, reactivation, and data retention policies. Archived cohort membership data is retained for 12 months after archival, after which DSN-level records are purged per Policy 97/50725 (Amazon Data Retention Policy) requirements. Aggregate statistics (cohort size over time, dimension distributions) are retained indefinitely.

**Action for unified service:** Add a lifecycle state machine with configurable staleness thresholds, archival policies, reactivation support, and data retention rules aligned with Policy 97.

---

### 7. Control Group Management with Temporal Exclusion

**CMS:** APIs for control group creation with matching criteria (device family, region, firmware version). Enforces temporal exclusion — a device cannot appear in both affected and control cohorts for overlapping time windows. Handles automatic replacement if a control device later exhibits the problem. Control group size configurable (default 10,000).

**Segmentation:** No control group concept. Sampling is about statistical representation, not differential analysis.

**Gap:** The Segmentation doc has no control group concept. Its sampling is about statistical representation of the fleet, not differential analysis between affected and healthy devices. A unified service would need APIs for control group creation, temporal exclusion enforcement, and automatic replacement when a control device becomes affected.

**Action for unified service:** Add control group creation APIs, temporal exclusion invariant enforcement, and automatic replacement logic.

---

### 8. Cross-Cohort Set Operations (Intersection, Union, Difference)

**CMS:** Query API supports set operations — intersection, union, and difference — enabling questions like "which devices are in cohort A but not cohort B?" Cross-cohort queries return within 2 seconds at p95.

**Segmentation:** No set operations across strata or samples.

**Gap:** The Segmentation doc has no set operations across strata or samples. A unified service would need query APIs supporting intersection/union/difference across any two groups.

**Action for unified service:** Add cross-group query APIs supporting ∩, ∪, ∖ with <2s p95 latency target.

---

### 9. Linked Entity References (Issues, Cases, Anomalies)

**CMS:** Cohort metadata includes linked entity references — Issue IDs, Case IDs, Anomaly IDs. Each cohort links to the characteristic it tracks. This enables navigation from a cohort to its associated investigation context.

**Segmentation:** Population/strata metadata has no concept of linking to external entities.

**Gap:** The Segmentation doc's population/strata metadata has no concept of linking to external entities (Issues, Cases, Anomalies). A unified service would need to extend the metadata model to support optional linked entity references.

**Action for unified service:** Extend the metadata model to support optional linked entity references (Issue ID, Case ID, Anomaly ID, custom definition).

---

### 10. Dual Ingestion Modes (Real-time Events + Batch FULL_SYNC)

**CMS:** Two ingestion modes: (1) Real-time — upstream producers emit individual membership change events via an event bus, processed within seconds. (2) Batch — producers submit a complete membership snapshot via Bulk Ingestion API with FULL_SYNC reconciliation (diff, add, remove, update). Both modes feed the same index and are not mutually exclusive.

**Segmentation:** Sample generation is periodic/batch-driven only. The Population Sample Generator periodically adjusts samples.

**Gap:** CMS needs real-time event-driven membership updates (device added/removed as anomalies are detected) in addition to batch. The Segmentation doc only has periodic batch recalculation. A unified service would need to support both real-time event ingestion and batch reconciliation feeding the same membership index.

**Action for unified service:** Add a real-time event ingestion path (event bus) alongside the existing batch recalculation. Both must feed the same membership index.

---

### 11. Explicit Device Removal with Audit Trail

**CMS:** Three removal mechanisms: (1) Explicit removal via Membership API (e.g., device repaired/replaced), (2) Lifecycle-based removal when cohort transitions to resolved, (3) Batch reconciliation (FULL_SYNC). All removals recorded in audit log with timestamp and reason.

**Segmentation:** Devices leave samples only via TTL expiry or becoming non-sampleable (offline, moved strata). No explicit removal API.

**Gap:** The Segmentation doc removes devices from samples only via TTL expiry or non-sampleability (offline). There's no explicit removal API with reason tracking. A unified service would need an explicit RemoveMember API with audit logging.

**Action for unified service:** Add a RemoveMember API with required reason field and audit logging.

---

### 12. Privacy Model (DSN Classification + pDSN Consideration)

**CMS:** DSNs classified as Highly Confidential / PII (Inherent Identifiers) per Policy 97. Encrypted at rest and in transit. Never written to application logs. Privacy review planned for Q2 2026 to evaluate pDSN (pseudonymized DSN) for membership tracking. If required, adds pseudonymization layer at ingestion and resolution layer at query time. Existing Panacea services already store DSNs under same classification, so pDSN not expected to be a hard requirement.

**Segmentation:** Does not explicitly address DSN data classification, pDSN pseudonymization, or Policy 97 compliance.

**Gap:** The Segmentation doc doesn't address DSN data classification, pDSN pseudonymization, or Policy 97 compliance explicitly. A unified service would need to account for the CMS privacy model, especially since the troubleshooting use case involves customer-device-level problem tracking (higher sensitivity than telemetry sampling).

**Action for unified service:** Adopt the CMS privacy model. If the privacy review requires pDSN, all producers (including Minerva sampling) would need to pseudonymize before writing. Plan for this as a shared concern.

---

### 13. Access Control Model (Write-Restricted, Read-Open)

**CMS:** Write access (CreateCohort, AddMember, RemoveMember) restricted to authorized Panacea subsystems via CloudAuth. Read access (LookupDSN, GetCohort, QueryCohorts) available to any system with valid Panacea service credential. Human access to raw DSN data requires L7+ manager approval plus Device Privacy team sign-off.

**Segmentation:** Simpler model — system owners define populations, Minerva consumes samples. No tiered write/read access control or human-access restrictions.

**Gap:** The Segmentation doc's access model is simpler — system owners define populations, Minerva consumes samples. There's no tiered write/read access control or human-access restrictions. A unified service would need CloudAuth-based write restrictions and tiered read access.

**Action for unified service:** Implement CloudAuth-based write restrictions and tiered read access. Add human-access controls for DSN-level data.

---

## Summary Table

| # | CMS Capability | Segmentation Equivalent | Action for Unified Service |
|---|---|---|---|
| 1 | Affected/Control cohort types | None (only sampling strata) | Add cohort type taxonomy |
| 2 | Temporal observation windows per device | Binary in/out + TTL | Extend membership record schema |
| 3 | DSN → all-cohorts reverse lookup | Forward lookup only | Add materialized reverse index + API |
| 4 | Deterministic correlation keys | None | Add correlation key generation |
| 5 | Composite cohorts (3-level hierarchy) | Flat strata | Add dynamic composition engine |
| 6 | Lifecycle states (active/resolved/archived) | None | Add lifecycle state machine |
| 7 | Control groups with temporal exclusion | None | Add control group APIs + exclusion invariant |
| 8 | Set operations (∩, ∪, ∖) | None | Add cross-group query APIs |
| 9 | Linked entity references (Issue/Case/Anomaly) | None | Extend metadata model |
| 10 | Real-time event ingestion | Batch-only recalculation | Add event bus ingestion path |
| 11 | Explicit removal with audit reason | TTL/offline removal only | Add RemoveMember API |
| 12 | DSN privacy model + pDSN consideration | Not addressed | Add privacy controls + review |
| 13 | Tiered access control (CloudAuth) | Simple system-owner model | Add write/read access tiers |

---

## Architectural Recommendation

The Segmentation doc's **Population Strata Grouping Service** is the natural home for the shared dimension model and stratification logic. The CMS capabilities would layer on top as a "Cohort Management" domain within the unified service, sharing the population/strata infrastructure but adding the troubleshooting-specific semantics.

The Segmentation doc already identifies this path in its extensibility section: *"Population sampling and aggregation efforts establish a system-managed population stratification layer that automatically constructs device populations using core attributes and continuously tracks population strata sizes to calculate statistically representative sample sizes. This foundation enables a central population stratification service for other services that also need to strata populations."*

The CMS is exactly that "other service." The delta above defines what it needs beyond what the stratification layer provides.

### Suggested Unified Service Layers

**Layer 3 — Domain-Specific APIs**

Two domain modules sit side-by-side, each consuming the shared engine below.

| Sampling Domain | Troubleshooting Domain |
|---|---|
| Sample configs (Full-Capture, Dynamic, Fixed) | Affected / Control cohort management |
| Confidence evaluation and monitoring | Composite cohorts (Anomaly → Issue → Case) |
| Population sample rotation (TTL-based) | DSN-to-Cohort reverse lookup (CS path) |
| On-device sampling enforcement | Cohort lifecycle (active → resolved → archived) |
| Telemetry upsampling (cloud-side) | Cross-cohort set operations (∩, ∪, ∖) |
| Confidence validation audits | Linked entity references (Issue, Case, Anomaly) |
| Device resource consumption analytics | Control group creation + temporal exclusion |

**Layer 2 — Shared Membership and Query Engine**

| Capability | Description |
|---|---|
| Membership index | Materialized DSN → group ID mapping, incrementally updated, O(1) lookup |
| Dimension-based filtering | Query by device family, firmware, region, custom key-value pairs |
| Correlation key generation | Deterministic hash of common dimensions for cross-system recognition |
| Dual ingestion | Real-time event bus + batch FULL_SYNC reconciliation, same index |
| Audit logging | All membership changes, config changes, and removals with timestamp + reason |
| Access control | CloudAuth-based write restrictions, tiered read access, L7+ human DSN access |

**Layer 1 — Population Stratification Foundation**

| Capability | Description |
|---|---|
| Population definitions | System owners define entity source, primary identifier, stratification attributes |
| Strata computation | Group entities by device type, firmware version, region; recalculate periodically |
| External source integration | DMS (active devices), Panorama (online devices), Internal Devices DB |
| Sampleable entity determination | Identify eligible devices (active, online, not opted-out) per strata |
| Target sample size calculation | 99% confidence, ±1% margin of error, with configurable over-sample buffer |

**Key design principle:** Layer 1 and Layer 2 are shared infrastructure. Neither the Sampling Domain nor the Troubleshooting Domain owns them — they are consumed equally by both. This prevents duplication and ensures a single source of truth for population data.

---

## Next Steps

1. **Align with Minerva team** (Nathan/Adam/Nick) on whether the Population Strata Grouping Service design can absorb the CMS membership and query requirements without compromising sampling latency targets.
2. **Privacy review** — Coordinate a single privacy review covering both use cases (sampling + troubleshooting) since both store DSN-level data.
3. **API contract design** — Draft a unified Smithy model that supports both sampling strata and troubleshooting cohorts as first-class group types with shared query infrastructure.
4. **Phase alignment** — CMS Phase 1 (Q2 2026) and Segmentation POC are on similar timelines. Determine if a shared Layer 1 can be delivered first, with domain-specific layers following.

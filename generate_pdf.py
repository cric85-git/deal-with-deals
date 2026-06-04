from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font("Arial", "B", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "CMS vs. Segmentation & Sampling Service — Feature Delta Analysis", align="R")
        self.ln(4)
        self.set_draw_color(200, 200, 200)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Arial", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.set_font("Arial", "B", 14)
        self.set_text_color(35, 47, 62)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(35, 47, 62)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def sub_title(self, title):
        self.set_font("Arial", "B", 12)
        self.set_text_color(0, 115, 187)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text):
        self.set_font("Arial", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bold_text(self, label, text):
        self.set_font("Arial", "B", 10)
        self.set_text_color(30, 30, 30)
        self.write(5.5, label)
        self.set_font("Arial", "", 10)
        self.write(5.5, text)
        self.ln(7)

    def action_box(self, text):
        self.set_fill_color(240, 248, 255)
        self.set_draw_color(0, 115, 187)
        self.set_font("Arial", "B", 10)
        self.set_text_color(0, 80, 140)
        x = self.get_x()
        y = self.get_y()
        self.rect(x, y, 190, 14, style="DF")
        self.set_xy(x + 3, y + 2)
        self.multi_cell(184, 5, "Action: " + text)
        self.ln(4)
        self.set_text_color(30, 30, 30)

    def add_table(self, headers, rows, col_widths):
        self.set_font("Arial", "B", 8)
        self.set_fill_color(35, 47, 62)
        self.set_text_color(255, 255, 255)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 7, h, border=1, fill=True, align="C")
        self.ln()
        self.set_font("Arial", "", 8)
        self.set_text_color(30, 30, 30)
        fill = False
        for row in rows:
            if fill:
                self.set_fill_color(245, 245, 245)
            else:
                self.set_fill_color(255, 255, 255)
            max_h = 7
            for i, cell in enumerate(row):
                lines = self.multi_cell(col_widths[i], 5, cell, dry_run=True, output="LINES")
                h = len(lines) * 5
                if h > max_h:
                    max_h = h
            x_start = self.get_x()
            y_start = self.get_y()
            for i, cell in enumerate(row):
                self.set_xy(x_start + sum(col_widths[:i]), y_start)
                self.multi_cell(col_widths[i], 5, cell, border="LR", fill=True)
            self.set_xy(x_start, y_start + max_h)
            fill = not fill
        # bottom border
        for w in col_widths:
            self.cell(w, 0, "", border="T")
        self.ln(6)


pdf = PDF()
pdf.add_font("Arial", "", "/System/Library/Fonts/Supplemental/Arial.ttf", uni=True)
pdf.add_font("Arial", "B", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", uni=True)
pdf.add_font("Arial", "I", "/System/Library/Fonts/Supplemental/Arial Narrow Italic.ttf", uni=True)
pdf.add_font("CourierNew", "", "/System/Library/Fonts/Supplemental/Courier New.ttf", uni=True)
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

# Title
pdf.set_font("Arial", "B", 18)
pdf.set_text_color(35, 47, 62)
pdf.multi_cell(0, 10, "CMS vs. Segmentation & Sampling Service\nFeature Delta Analysis")
pdf.ln(2)

pdf.set_font("Arial", "", 10)
pdf.set_text_color(100, 100, 100)
pdf.cell(0, 6, "Date: 4/14/26  |  Author: Shail Bhatt", new_x="LMARGIN", new_y="NEXT")
pdf.ln(2)

pdf.set_draw_color(35, 47, 62)
pdf.line(10, pdf.get_y(), 200, pdf.get_y())
pdf.ln(6)

# Purpose
pdf.body_text("Purpose: Identify capabilities proposed in the Panacea Cohort Management System (CMS) PRFAQ that are not covered by the Minerva Population Sampling and Aggregation functional design — to inform what must be accounted for if the two systems converge into a single service.")

# Context
pdf.section_title("Context")
pdf.body_text("Two documents propose new infrastructure for managing device populations:")
pdf.bold_text("1. Panacea CMS PRFAQ — ", "A purpose-built service for tracking groups of devices affected by detected problems, enabling troubleshooting workflows across Anomaly Detection, Issue Detection, Case Management, and Customer Support.")
pdf.bold_text("2. Minerva Sampling & Aggregation — ", "A system for reducing telemetry footprint by 90% through confidence-based population stratification sampling, enforced pre-storage on devices.")
pdf.body_text("Both systems share a common foundation: grouping devices by shared characteristics (device type, software version, region) and managing membership in those groups. The question is whether they should be one service or two.")

# Delta items
pdf.section_title("Delta: CMS Capabilities Not in Segmentation Doc")

deltas = [
    ("1. Problem-Driven Cohorts (Affected/Control Paradigm)",
     "CMS: Groups devices for troubleshooting — tracking which devices exhibit a detected problem. Cohorts are typed as affected, control, composite, or investigation-sample.",
     "Segmentation: Groups devices for telemetry optimization only. No concept of affected vs. control or problem-linked grouping.",
     "Add a cohort type taxonomy (affected, control, composite, investigation-sample) alongside sampling strata."),

    ("2. Temporal Membership Tracking (Observation Windows)",
     "CMS: Each membership record contains DSN, immutable first_seen timestamp, occurrence_count, and a bounded set of recent non-overlapping observation time ranges. Teams can distinguish a device affected once from one affected repeatedly.",
     "Segmentation: Membership is binary — in sample or out with a rotation TTL (3-7 days). No temporal history.",
     "Extend membership record schema to support both models — simple TTL for sampling, temporal observation windows for troubleshooting."),

    ("3. DSN-to-Cohort Reverse Lookup (CS Path)",
     "CMS: A single API call resolves a DSN to every cohort it belongs to, along with linked Issues, in under 100ms at p99. Powers CS associate workflows and AI self-service.",
     "Segmentation: Has 100ms forward lookup (device -> sampling config). No reverse lookup (DSN -> all problems/cohorts).",
     "Add a materialized reverse index (DSN -> all cohort IDs + linked Issues) with O(1) lookup and new LookupDSN API."),

    ("4. Cross-Domain Cohort Correlation Keys",
     "CMS: Every cohort has a deterministic correlation key — a hash of device family, firmware version, and region. Two independent systems resolve to the same key without coordination.",
     "Segmentation: Strata defined by system owners for sampling. No deterministic cross-system correlation mechanism.",
     "Add deterministic correlation key generation so independent systems can recognize overlapping populations."),

    ("5. Composite Cohorts (Hierarchical Composition)",
     "CMS: Composite cohorts are dynamic unions of child cohorts, evaluated at query time. Supports 3 levels: Anomaly -> Issue -> Case.",
     "Segmentation: Strata are flat groupings. No hierarchy or composition.",
     "Add dynamic composition engine supporting union-based composite groups up to 3 levels deep."),

    ("6. Cohort Lifecycle Management",
     "CMS: Full lifecycle: active -> resolved -> archived. Staleness threshold (60 days) triggers archival. Archived cohorts can be reactivated. DSN records purged after 12 months per Policy 97.",
     "Segmentation: No lifecycle states. Strata exist as long as population definition exists.",
     "Add lifecycle state machine with configurable staleness thresholds, archival policies, reactivation, and data retention rules."),

    ("7. Control Group Management with Temporal Exclusion",
     "CMS: APIs for control group creation with matching criteria. Enforces temporal exclusion — device cannot appear in both affected and control cohorts for overlapping time windows. Automatic replacement if control device becomes affected.",
     "Segmentation: No control group concept. Sampling is about statistical representation, not differential analysis.",
     "Add control group creation APIs, temporal exclusion invariant enforcement, and automatic replacement logic."),

    ("8. Cross-Cohort Set Operations",
     "CMS: Query API supports intersection, union, and difference. Cross-cohort queries return within 2 seconds at p95.",
     "Segmentation: No set operations across strata or samples.",
     "Add cross-group query APIs supporting intersection, union, difference with <2s p95 latency."),

    ("9. Linked Entity References",
     "CMS: Cohort metadata includes linked entity references — Issue IDs, Case IDs, Anomaly IDs. Enables navigation from cohort to investigation context.",
     "Segmentation: No concept of linking to external entities.",
     "Extend metadata model to support optional linked entity references (Issue ID, Case ID, Anomaly ID)."),

    ("10. Dual Ingestion Modes (Real-time + Batch)",
     "CMS: Real-time event bus ingestion (processed within seconds) + Batch FULL_SYNC reconciliation. Both feed the same membership index and are not mutually exclusive.",
     "Segmentation: Periodic batch-driven sample generation only.",
     "Add real-time event ingestion path alongside existing batch recalculation, both feeding same index."),

    ("11. Explicit Device Removal with Audit Trail",
     "CMS: Three removal mechanisms — explicit API removal, lifecycle-based removal, batch reconciliation. All removals recorded with timestamp and reason.",
     "Segmentation: Devices leave samples only via TTL expiry or becoming non-sampleable. No explicit removal API.",
     "Add RemoveMember API with required reason field and audit logging."),

    ("12. Privacy Model (DSN Classification + pDSN)",
     "CMS: DSNs classified as Highly Confidential / PII per Policy 97. Encrypted at rest and in transit. Privacy review planned for Q2 2026 to evaluate pDSN pseudonymization.",
     "Segmentation: Does not explicitly address DSN data classification or Policy 97 compliance.",
     "Adopt CMS privacy model. Coordinate single privacy review covering both use cases."),

    ("13. Access Control Model (Write-Restricted, Read-Open)",
     "CMS: Write access restricted to authorized Panacea subsystems via CloudAuth. Read access open to any valid credential. Human DSN access requires L7+ approval + Device Privacy sign-off.",
     "Segmentation: Simple system-owner model. No tiered access control.",
     "Implement CloudAuth-based write restrictions, tiered read access, and human-access controls for DSN data."),
]

for title, cms, seg, action in deltas:
    if pdf.get_y() > 230:
        pdf.add_page()
    pdf.sub_title(title)
    pdf.bold_text("CMS: ", cms.replace("CMS: ", ""))
    pdf.bold_text("Segmentation: ", seg.replace("Segmentation: ", ""))
    pdf.action_box(action)

# Summary Table
pdf.add_page()
pdf.section_title("Summary Table")

headers = ["#", "CMS Capability", "Segmentation Equivalent", "Action for Unified Service"]
col_widths = [8, 52, 52, 78]
rows = [
    ["1", "Affected/Control cohort types", "None (only sampling strata)", "Add cohort type taxonomy"],
    ["2", "Temporal observation windows", "Binary in/out + TTL", "Extend membership record schema"],
    ["3", "DSN -> all-cohorts reverse lookup", "Forward lookup only", "Add materialized reverse index + API"],
    ["4", "Deterministic correlation keys", "None", "Add correlation key generation"],
    ["5", "Composite cohorts (3-level)", "Flat strata", "Add dynamic composition engine"],
    ["6", "Lifecycle states", "None", "Add lifecycle state machine"],
    ["7", "Control groups + temporal exclusion", "None", "Add control group APIs + exclusion invariant"],
    ["8", "Set operations", "None", "Add cross-group query APIs"],
    ["9", "Linked entity references", "None", "Extend metadata model"],
    ["10", "Real-time event ingestion", "Batch-only", "Add event bus ingestion path"],
    ["11", "Explicit removal + audit", "TTL/offline only", "Add RemoveMember API"],
    ["12", "DSN privacy + pDSN", "Not addressed", "Add privacy controls + review"],
    ["13", "Tiered access control", "Simple model", "Add write/read access tiers"],
]
pdf.add_table(headers, rows, col_widths)

# Recommendation
pdf.section_title("Architectural Recommendation")
pdf.body_text("The Segmentation doc's Population Strata Grouping Service is the natural home for the shared dimension model and stratification logic. The CMS capabilities would layer on top as a 'Cohort Management' domain within the unified service, sharing the population/strata infrastructure but adding troubleshooting-specific semantics.")
pdf.ln(2)
pdf.body_text("Suggested Unified Service Layers:")
pdf.ln(2)
pdf.set_font("CourierNew", "", 8)
pdf.multi_cell(0, 4, """Layer 3: Domain-Specific APIs
  +-- Sampling Domain: Sample configs, confidence eval, rotation, enforcement
  +-- Troubleshooting Domain: Affected/Control mgmt, composite cohorts,
      DSN reverse lookup, lifecycle, set operations, linked entities

Layer 2: Shared Membership & Query Engine
  Membership index (DSN -> groups), dimension filtering, correlation keys,
  audit logging, real-time + batch ingestion, access control (CloudAuth)

Layer 1: Population Stratification Foundation
  Population definitions, strata computation (device type, FW, region),
  external source integration (DMS, Panorama), sampleable entity determination""")
pdf.ln(6)

# Next Steps
pdf.set_font("Arial", "", 10)
pdf.section_title("Next Steps")
pdf.body_text("1. Align with Minerva team (Nathan/Adam/Nick) on whether the Population Strata Grouping Service design can absorb CMS membership and query requirements without compromising sampling latency targets.")
pdf.body_text("2. Privacy review — Coordinate a single privacy review covering both use cases (sampling + troubleshooting) since both store DSN-level data.")
pdf.body_text("3. API contract design — Draft a unified Smithy model supporting both sampling strata and troubleshooting cohorts as first-class group types with shared query infrastructure.")
pdf.body_text("4. Phase alignment — CMS Phase 1 (Q2 2026) and Segmentation POC are on similar timelines. Determine if a shared Layer 1 can be delivered first, with domain-specific layers following.")

pdf.output("CMS_vs_Segmentation_Delta_Analysis.pdf")
print("PDF generated successfully")

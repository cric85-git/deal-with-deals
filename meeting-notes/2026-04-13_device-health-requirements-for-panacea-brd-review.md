# Device Health requirements for Panacea BRD Review

**Date:** 2026-04-13
**Time:** 08:30 AM - 09:30 AM PDT (00:47:55 actual)
**Attendees:** Martin, Lisa; Kopczynski, Jared; Janakiraman, Sivarama Krishnan; Alcazar, Richard; Li, Bingjie; Juarez, Claudia; Bahl, Rohit; Karbhari, Zarana; Sharma, Priyanka; Tymoshchuk, Vova; Chandak, Vishal; Bhatt, Shail; Miller, Erik; Pradhan, Suyash; Singh, Gajendra; Kale, Rricha

---

Team reviewed merged business requirements document for device health monitoring system, focusing on priority zero requirements and implementation timeline. The team conducted a review of the merged business requirements document (BRD) for a device health monitoring system, with particular focus on the Pippin-processed version that reorganized requirements into user stories and added acronym definitions. Key discussion centered around automatically surfacing correlated metric regressions, custom analytics requirements including sketching techniques for high-frequency data, and alarm configuration capabilities. The engineering team committed to providing detailed implementation plans and timelines for all priority zero requirements by end of week.

## Action Items
- Provide detailed implementation plans and timelines for all priority zero requirements
- Address open issues in the document's decision log table
- Send launch details link for Kitty Hawk devices
- Discuss sketching technique requirements with Shiva for custom analytics support

## Decisions
- Use the Pippin-processed version of the BRD as the primary document for review
- Reclassify the automatic correlation requirement from P0 to P1 priority
- Focus internal team review on all priority zero requirements this week
- Include Chris Rivera in future discussions for device-side metrics considerations

## Announcements
- Three new tablet devices (Kitty Hawk) will be shipped this year for the first time
- Automatic correlation functionality is actively being developed and planned for Q3 delivery

## Document review process

The team reviewed two versions of the BRD - the original merged version and a Pippin-processed version that reorganized requirements into user stories and added formatting improvements. The Pippin version was selected as the primary document, though some hyperlinks needed manual copying from the original.

## Priority zero requirements focus

Discussion emphasized the need for the engineering team to conduct detailed analysis of all priority zero requirements to determine feasibility and implementation timelines. The team acknowledged that while most requirements appear supportable, detailed technical analysis is needed to identify potential risks or timeline concerns.

## Correlated metrics analysis

Extensive discussion covered the requirement for automatically surfacing correlated metric regressions across performance, stability, and power domains. Examples included correlations between thermal issues and stability problems, EMMC aging effects on device performance, and ANR impacts on fluidity metrics. The team clarified this involves identifying logical groupings of related KPIs rather than correlating all metrics universally.

## Custom analytics pipeline requirements

Detailed technical discussion addressed custom analytics needs, specifically sketching techniques for high-frequency data collection (CPU, memory, disk usage collected every 5 seconds). This requires specialized data processing pipelines that can handle compressed sketches from devices, invert them on the cloud side, and display results in dashboards - representing a departure from standard metric processing flows.

## Device platform considerations

The team highlighted the importance of including device-side expertise in future discussions, particularly for legacy device support (748 devices) that may have fundamental limitations for certain statistical measures like percentiles. Special attention was noted for Canto Mercer and new Kitty Hawk tablet devices.

## Alarm configuration capabilities

Brief discussion touched on alarm threshold management, with preference expressed for manual threshold control rather than fully automated alarm creation to avoid excessive notifications.

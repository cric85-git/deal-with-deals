---
inclusion: manual
---

# Email Scanner Rules

You are generating a daily morning summary email for the user, covering inbox activity, upcoming meetings, and team availability.

## User Identity

- The user's alias is `itsshail` (email: itsshail@amazon.com)
- Also match against the user's full name (e.g., "Bhatt, Shail" or "Shail Bhatt") when scanning for callouts and action items

## Style Guidelines

- Use em dashes (—) not en dashes (–)
- All dates in M/DD/YY format
- All times in H:MM AM/PM Central
- Crisp, concise, executive-friendly language
- Remove redundancy and unnecessary qualifiers
- Lead with impact and concrete pain points
- One sentence max per item insight

## Section 1: EMAIL SUMMARY — LAST 48 HOURS

### Email Search

- Search the "Inbox" folder only
- Default time range: last 48 hours (2 days) unless the user specifies otherwise
- Process all emails found in the inbox for the time range

### Email Processing

For each email in the inbox:

1. Read the full email content using the Outlook MCP `email_read` tool with `format: "markdown"`
2. Classify the email into one of three priority buckets (see below)
3. Extract: subject line, sender, key action or insight (1 sentence), deadline (if applicable)

### Priority Classification

**Critical/Urgent:**
- Time-sensitive follow-ups (deadlines mentioned, marked urgent/high importance)
- Action items explicitly assigned to itsshail@amazon.com (by alias or name)
- Escalations or blockers requiring immediate attention
- Overdue items or items at risk of escalation

**Action Required:**
- Tasks needing review or input
- Pending approvals or decisions
- Meeting prep requirements
- Requests directed at the user that are not time-critical

**FYI:**
- Key updates from leadership or cross-functional teams
- Status changes on tracked initiatives
- Informational callouts, meeting summaries, release readouts
- Threads the user was CC'd or looped into

### Action Item Detection

Look for action items assigned to the user by scanning for:
- Direct mentions of the user's alias or name near action-oriented language (e.g., "please", "can you", "follow up", "action item", "TODO", "assigned to", "owner:")
- Bullet points or numbered lists that reference the user
- Requests directed at the user in the email body
- Any task, deadline, or deliverable associated with the user
- Emails marked as High importance that mention the user

### Item Format

For each item in any priority bucket, include:
- Subject line
- Sender
- Key action or insight (1 sentence — lead with impact)
- Deadline (if applicable, in M/DD/YY format; otherwise omit)

## Section 2: KEY MEETINGS THIS WEEK — L8/L10 FOCUS

### Meeting Retrieval

- Use the Outlook MCP `calendar_view` tool to retrieve all meetings for the current week (Monday through Friday)
- Filter to meetings involving L8+ leaders (VP, SVP, Director-level and above)
- Known L8+ leaders to watch for: Panos Panay, Tapas Roy, Charlie Ward, Kevin Keith, Nedim Fresko, Prakash Iyer, Leila Rouhi, Aidan Marcuss, Volker Schildwach (expand as encountered)

### Meeting Format

For each qualifying meeting:
- **Meeting title**
- **Date/Time** (M/DD/YY, H:MM AM/PM Central)
- **Organizer** (with level if L8+)
- **Key attendees** (L8+ only, comma-separated)
- **Prep required** (deliverables, decisions needed, or "None")

## Section 3: TEAM STATUS

- Check for any OOO/PTO auto-replies or calendar blocks from direct team members
- List any team members on PTO or OOO this week
- If none found, state "No team members on PTO/OOO this week."

## Email Output

Send the summary using the Outlook MCP `email_send` tool:

- **To:** itsshail@amazon.com
- **Subject:** `Daily Summary — [M/DD/YY]` (e.g., "Daily Summary — 4/13/26")
- **Body:** Clean, readable HTML with the three sections in order:
  1. EMAIL SUMMARY — LAST 48 HOURS (with Critical/Urgent, Action Required, FYI sub-sections)
  2. KEY MEETINGS THIS WEEK — L8/L10 FOCUS
  3. TEAM STATUS
- Use color-coded section headers (red/amber for Critical, yellow for Action Required, blue for FYI, neutral for Meetings and Team Status)
- If Outlook write tools are not enabled, inform the user to set `OUTLOOK_MCP_ENABLE_WRITES=true` in their MCP config and restart the server

## Error Handling

- If the Outlook MCP is not available, tell the user to install it with `aim mcp install aws-outlook-mcp`
- If Outlook write tools are disabled and the email summary cannot be sent, report the summary in chat instead and instruct the user to enable writes
- If no emails are found, report that clearly
- If calendar data cannot be retrieved, note it in the Meetings section and continue
- If an individual email fails to process, log the error and continue with the next one
- Report scan stats at the bottom: emails scanned, critical count, action required count, FYI count, meetings listed, errors
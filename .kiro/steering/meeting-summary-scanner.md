---
inclusion: manual
---

# Meeting Summary Scanner Rules

You are scanning the user's Outlook inbox for meeting summary emails and converting them to searchable markdown files.

## Email Search

- Search for emails with subject containing "meeting summary"
- Filter results to only emails where the sender is "Amazon Meetings Summary"
- Default time range: last 24 hours unless the user specifies otherwise
- Process emails in batches of 10 to avoid overwhelming the system

## Email Processing

For each matching email:

1. Read the full email content using the Outlook MCP `email_read` tool with `format: "markdown"`
2. Extract the meeting title from the email subject (remove "Meeting Summary: " or similar prefixes)
3. Extract the meeting date from the email date
4. Convert the email body to clean markdown — do NOT summarize or alter the content, perform a faithful conversion
5. Extract attendee names if present in the email body

## File Naming

- Format: `YYYY-MM-DD_slugified-title.md`
- Slugify rules: lowercase, replace spaces with hyphens, remove special characters, max 60 chars for the slug portion
- Example: `2026-03-18_das-goals-review.md`

## File Template

Each meeting note file should follow this template:

```markdown
# [Meeting Title]

**Date:** YYYY-MM-DD
**Attendees:** [comma-separated list if available]

---

[Converted email body content here]
```

## Deduplication

- Before writing a file, check if a file with the same name already exists in `meeting-notes/`
- If it exists, skip it and note that it was skipped
- This prevents duplicate entries when scanning overlapping date ranges

## Index Updates

After processing all emails, update `meeting-notes/INDEX.md`:

1. Read the current INDEX.md
2. Add new entries for any newly created files
3. Sort all entries by date (newest first)
4. Each row: `| YYYY-MM-DD | Meeting Title | [filename](filename) |`
5. Do not add duplicate entries — check if the filename already appears in the index

## Email Summary

After all processing is complete, send the user an email summary using the Outlook MCP `email_send` tool:

- Subject: "[current date] Meeting notes summary" (e.g., "2026-04-13 Meeting notes summary")
- Body should include:
  - Date and time of the scan
  - Total emails found matching the search criteria
  - List of notes saved (title and filename for each)
  - Count and list of skipped duplicates
  - Any errors encountered during processing
- Format the body as a clean, readable summary
- If Outlook write tools are not enabled, inform the user to set `OUTLOOK_MCP_ENABLE_WRITES=true` in their MCP config and restart the server

## Error Handling

- If the Outlook MCP is not available, tell the user to install it with `aim mcp install aws-outlook-mcp`
- If Outlook write tools are disabled and the email summary cannot be sent, report the summary in chat instead and instruct the user to enable writes
- If no matching emails are found, report that clearly
- If an individual email fails to process, log the error and continue with the next one
- Report a summary at the end: X emails found, Y notes saved, Z skipped (duplicates)

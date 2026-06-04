# Meeting Notes Auto-Scanner Kit

Automatically pull your meeting summaries from Outlook and save them as searchable markdown files — powered by [Kiro](https://kiro.dev).

This kit scans your inbox for emails from "Amazon Meetings Summary", converts them to clean markdown, and maintains a searchable index so you (or Kiro) can quickly find meetings by date, title, or attendee.

## What's in the Kit

```
meeting-notes-kit/
├── .kiro/
│   ├── hooks/
│   │   └── scan-meeting-summaries.kiro.hook   # One-click trigger button
│   └── steering/
│       └── meeting-summary-scanner.md          # Processing rules for Kiro
├── meeting-notes/
│   └── INDEX.md                                # Searchable table (starts empty)
└── README.md                                   # You're reading it
```

> **Note:** The `.kiro/` folder is a hidden "dotfile" directory. macOS Finder hides it by default. You can see it in Terminal with `ls -la`, or toggle hidden files in Finder with `Cmd+Shift+.`. Kiro's file explorer shows it normally.

## Prerequisites

- [Kiro IDE](https://kiro.dev) installed
- The Outlook MCP server (setup below)
- Amazon Meetings Summary emails in your Outlook inbox

## Setup

### 1. Copy the kit into your workspace

Unzip and copy the contents into the root of your Kiro workspace. Use Terminal so the hidden `.kiro/` folder gets included:

```bash
cp -r meeting-notes-kit/.kiro/ /path/to/your/workspace/.kiro/
cp -r meeting-notes-kit/meeting-notes/ /path/to/your/workspace/meeting-notes/
```

If you already have a `.kiro/` folder, this merges the new files in without overwriting anything.

### 2. Install the Outlook MCP Server

Kiro needs the Outlook MCP to read your email. Install it with one command in your terminal:

```bash
aim mcp install aws-outlook-mcp
```

After it installs, Kiro will detect the new server and connect automatically. You can verify it's running in the MCP Server view in the Kiro sidebar.

### 3. Set Kiro to Autopilot Mode

For the scanner to save files without prompting you for each one, switch Kiro to **Autopilot** mode (click the mode toggle in the chat panel). This is especially important during backfills where dozens of files get created. You can switch back to Supervised mode afterward if you prefer.

### 4. Done

That's it. Open the workspace in Kiro and you're ready to scan.

## Daily Usage

### Option A: Click the Hook (easiest)

1. Open the **Agent Hooks** section in Kiro's explorer panel
2. Click **Scan Meeting Summaries**
3. Kiro scans the last 24 hours and saves any new meeting notes

Do this each morning and you'll always be current.

### Option B: Use Chat Prompts

Open Kiro chat and paste any of these:

**Daily scan (last 24 hours):**
```
#meeting-summary-scanner Scan my inbox for new meeting summaries
```

**Catch up after time off:**
```
#meeting-summary-scanner Scan my inbox for meeting summaries from the last 2 weeks
```

**Full backfill (e.g., start of year):**
```
#meeting-summary-scanner Scan my inbox for meeting summaries since 2026-01-01
```

**Specific day:**
```
#meeting-summary-scanner Scan my inbox for meeting summaries from 2026-03-15
```

> Always include `#meeting-summary-scanner` — this loads the steering file so Kiro knows the rules.

### First-Time Backfill

When you first set this up, you'll probably want to pull in your history. Paste this into Kiro chat:

```
#meeting-summary-scanner Scan my inbox for meeting summaries since 2026-01-01
```

This may take a few minutes depending on volume. Kiro will process them in batches, skip duplicates, and update the index.

## Querying Your Notes

Once you have notes saved, ask Kiro about them:

**Find meetings with someone:**
```
Look at meeting-notes/INDEX.md and tell me which meetings included [person's name]
```

**Find meetings about a topic:**
```
Search through the meeting-notes/ folder for any meetings that discussed [topic]
```

**Summarize a meeting:**
```
Read meeting-notes/2026-03-18_das-goals-review.md and give me the key action items
```

**Weekly recap:**
```
Look at meeting-notes/INDEX.md and summarize what meetings I had the week of March 16
```

## How It Works

1. Kiro searches your Outlook inbox for "meeting summary" emails via the Outlook MCP
2. Filters to only emails from "Amazon Meetings Summary"
3. Reads each email and converts the HTML body to clean markdown (no summarization — faithful conversion)
4. Saves each as `YYYY-MM-DD_slugified-title.md` in `meeting-notes/`
5. Skips any files that already exist (deduplication by filename)
6. Updates `meeting-notes/INDEX.md` with new entries sorted by date

## Customization

The steering file (`.kiro/steering/meeting-summary-scanner.md`) controls all behavior. You can tweak:

- The email subject filter
- The sender filter
- The markdown template
- The file naming convention
- The index format

Edit it to fit your team's needs.

## Tips

- The index makes lookups fast — Kiro can scan it instead of reading every file
- Meeting notes are plain markdown, so they work with git, grep, and any editor
- Commit the `meeting-notes/` folder to share notes with your team
- The hook is the lowest-friction daily workflow — one click, done

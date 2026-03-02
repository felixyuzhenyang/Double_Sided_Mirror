---
name: yyz-collaboration-protocol
description: Enforce YYZ-specific collaboration and logging rules for this repository. Use when handling any request in the Double_Sided_Mirror project that requires user-facing replies, code edits, skill updates, or log synchronization so records stay current without repeated confirmation prompts.
---

# YYZ Collaboration Protocol

## Goal

Apply YYZ's fixed communication and logging conventions for every turn in this project.

## Required Rules

1. Use Chinese for direct conversation with the user unless the user explicitly requests another language.
2. Use English for all file edits (code, docs, skills, logs).
3. After each completed implementation round, automatically sync a concise summary to `logs/conversation-log.md`.
4. If files changed, automatically sync a detailed change entry to `logs/code-change-log.md` without asking for confirmation.
5. Keep the latest log entry aligned with the newest code state: changed files, validation performed, and known risks.
6. Whenever workflow requirements evolve, update the corresponding `skills/*/SKILL.md` or relevant references in the same round.

## Execution Checklist

1. Determine whether this round modified any files.
2. Apply requested code or documentation updates.
3. Update matching skill files for new or changed requirements.
4. Append/update conversation and code-change logs in the same turn.
5. In the final response, report what was synchronized to logs.

## Logging Template Guidance

- Conversation log entry should include: date/time, user request summary, actions taken, files affected, and operational note.
- Code change log entry should include: date/time, task, full changed-file list, change summary, verification steps, and residual risk/follow-up.
- Do not store plaintext API keys or secrets in logs.

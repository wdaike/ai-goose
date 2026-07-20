---
title: Smart Context Management
sidebar_position: 3
sidebar_label: Smart Context Management
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import { ScrollText } from 'lucide-react';

Models have a finite context window. goose delegates context accounting, automatic
compaction, and compacted thread state to the embedded Codex runtime instead of
maintaining a second conversation-summary pipeline.

## Automatic Compaction

Codex automatically compacts a thread as it approaches its configured token limit.
The original messages remain available in goose for display, while Codex owns the
active compacted context and its persisted thread state.

`GOOSE_AUTO_COMPACT_THRESHOLD` can set the compaction point as a fraction of the
model context limit. For example, this configures Codex to compact at 60%:

```bash
export GOOSE_AUTO_COMPACT_THRESHOLD=0.6
```

When no threshold is configured, Codex uses its model-specific default. The override
is applied when a Codex thread is started or resumed and requires a known model
context limit.

## Manual Compaction

Manual compaction also uses Codex's native thread compaction.

<Tabs groupId="interface">
  <TabItem value="ui" label="goose Desktop" default>

  1. Open the token-usage indicator next to the model name.
  2. Click <ScrollText className="inline" size={16} /> `Compact now`.
  3. Continue the session after compaction completes.

  </TabItem>
  <TabItem value="cli" label="goose CLI">

  Run `/compact` and confirm the prompt:

  ```text
  ( O)> /compact
  ```

  `/summarize` remains an alias for compatibility.

  </TabItem>
</Tabs>

## Clearing Context

`/clear` removes the goose conversation and its Codex thread association. The next
message starts a new Codex thread, so the previous model context is not resumed.

## Maximum Turns

`GOOSE_MAX_TURNS` limits how many consecutive actions a session can take without
new user input. A task-specific value can also be supplied with
`goose session --max-turns` or `goose run --max-turns`.

## Token Usage

goose displays token usage reported by Codex. Desktop shows a context indicator near
the model selector, and CLI shows a compact usage label above the prompt.

For custom model deployments, `GOOSE_CONTEXT_LIMIT` overrides the context limit used
for product display and for converting `GOOSE_AUTO_COMPACT_THRESHOLD` into Codex's
absolute token limit. `GOOSE_PLANNER_CONTEXT_LIMIT` remains specific to planning mode.

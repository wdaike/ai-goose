import { v7 as uuidv7 } from 'uuid';
import type { SteerSessionResponse_unstable } from '../types/goose';
import type { Message } from '../types/message';
import { codex } from '../codex/client';
import { getActiveTurnId } from '../codex/engine/controller';

export async function acpSteerSession(
  sessionId: string,
  message: Message,
  expectedRunId: string
): Promise<SteerSessionResponse_unstable> {
  const expectedTurnId = getActiveTurnId(sessionId) ?? expectedRunId;
  const text = message.content
    .map((content) => (content.type === 'text' ? content.text : ''))
    .filter(Boolean)
    .join('\n');
  const clientUserMessageId = uuidv7();
  await codex.turnSteer({
    threadId: sessionId,
    expectedTurnId,
    clientUserMessageId,
    input: [{ type: 'text', text, text_elements: [] }],
  });
  return { messageId: clientUserMessageId } as SteerSessionResponse_unstable;
}

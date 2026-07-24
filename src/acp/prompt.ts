import { v7 as uuidv7 } from 'uuid';
import type { ContentBlock, PromptResponse } from '@agentclientprotocol/sdk';
import type { SteerSessionResponse_unstable } from '../types/goose';
import type { Message } from '../types/message';
import { codex } from '../codex/client';
import { getActiveTurnId } from '../codex/engine/controller';
import { getAcpClient } from './acpConnection';

export async function acpPromptSession(
  sessionId: string,
  message: Message
): Promise<PromptResponse> {
  const client = await getAcpClient();
  return client.prompt({
    sessionId,
    prompt: messageToAcpPromptContent(message),
  });
}

export async function acpCancelPrompt(sessionId: string): Promise<void> {
  const client = await getAcpClient();
  await client.cancel({ sessionId });
}

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

export function messageToAcpPromptContent(message: Message): ContentBlock[] {
  const prompt: ContentBlock[] = [];

  for (const content of message.content) {
    switch (content.type) {
      case 'text':
        if (content.text.trim()) {
          prompt.push({
            type: 'text',
            text: content.text,
          });
        }
        break;
      case 'image':
        prompt.push({
          type: 'image',
          data: content.data,
          mimeType: content.mimeType,
        });
        break;
    }
  }

  return prompt;
}

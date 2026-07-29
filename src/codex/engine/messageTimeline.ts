import { getToolRequests, getToolResponses, type Message } from '../../types/message';

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
};

/**
 * A group's clock runs until the last response to one of its requests lands. Scanning
 * stops at the first message carrying no responses, since that message ends the batch —
 * and if the agent spoke there, its timestamp still counts as the completion.
 */
export const toolCallGroupDuration = (messages: Message[], group: number[]): number => {
  const startedAt = messages[group[0]].created;
  const lastIndex = group[group.length - 1];
  const requestIds = new Set(
    group.flatMap((index) => getToolRequests(messages[index]).map((request) => request.id))
  );
  let completedAt = messages[lastIndex].created;

  for (let i = lastIndex + 1; i < messages.length; i++) {
    const responses = getToolResponses(messages[i]);

    if (responses.some((response) => requestIds.has(response.id))) {
      completedAt = Math.max(completedAt, messages[i].created);
    }

    if (responses.length === 0) {
      if (messages[i].role === 'assistant') {
        completedAt = Math.max(completedAt, messages[i].created);
      }
      break;
    }
  }

  return Math.max(1, Math.round(completedAt - startedAt));
};

/** Same idea as a tool-call group, but any response extends the window — ids are not tracked. */
export const workGroupDuration = (messages: Message[], group: number[]): number => {
  const startedAt = messages[group[0]].created;
  const lastIndex = group[group.length - 1];
  let completedAt = messages[lastIndex].created;

  for (let i = lastIndex + 1; i < messages.length; i++) {
    if (getToolResponses(messages[i]).length > 0) {
      completedAt = Math.max(completedAt, messages[i].created);
      continue;
    }
    if (messages[i].role === 'assistant') {
      completedAt = Math.max(completedAt, messages[i].created);
    }
    break;
  }

  return Math.max(1, Math.round(completedAt - startedAt));
};

export const resolvedModelOf = (message: Message): string | null => {
  if (message.role !== 'assistant' || !message.metadata.userVisible) return null;
  return message.metadata.inference?.resolvedModel ?? null;
};

/** The model in effect before `index`, used to disclose mid-conversation model switches. */
export const previousResolvedModel = (messages: Message[], index: number): string | null => {
  for (let i = index - 1; i >= 0; i--) {
    const model = resolvedModelOf(messages[i]);
    if (model) return model;
  }
  return null;
};

export const hasOnlyToolResponses = (message: Message): boolean =>
  message.content.every((content) => content.type === 'toolResponse');

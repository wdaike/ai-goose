import { MessageCircle, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react';
import { defineMessages } from '../../../i18n';
import type { MessageDescriptor } from 'react-intl';

const i18n = defineMessages({
  fullAccess: {
    id: 'permissionModeChip.fullAccess',
    defaultMessage: 'Full access',
  },
  fullAccessDescription: {
    id: 'modeSelectionItem.autonomousDescription',
    defaultMessage: 'Full file modification capabilities, edit, create, and delete files freely.',
  },
  smartApprove: {
    id: 'permissionModeChip.smartApprove',
    defaultMessage: 'Smart approval',
  },
  smartApproveDescription: {
    id: 'modeSelectionItem.smartDescription',
    defaultMessage: 'Intelligently determine which actions need approval based on risk level',
  },
  approve: {
    id: 'permissionModeChip.approve',
    defaultMessage: 'Manual approval',
  },
  approveDescription: {
    id: 'modeSelectionItem.manualDescription',
    defaultMessage: 'All tools, extensions and file modifications will require human approval',
  },
  chatOnly: {
    id: 'permissionModeChip.chatOnly',
    defaultMessage: 'Chat only',
  },
  chatOnlyDescription: {
    id: 'modeSelectionItem.chatOnlyDescription',
    defaultMessage: 'Engage with the selected provider without using tools or extensions.',
  },
});

export interface PermissionMode {
  key: string;
  label: MessageDescriptor;
  description: MessageDescriptor;
  icon: LucideIcon;
  warn: boolean;
}

export const PERMISSION_MODES: PermissionMode[] = [
  {
    key: 'auto',
    label: i18n.fullAccess,
    description: i18n.fullAccessDescription,
    icon: ShieldAlert,
    warn: true,
  },
  {
    key: 'smart_approve',
    label: i18n.smartApprove,
    description: i18n.smartApproveDescription,
    icon: ShieldCheck,
    warn: false,
  },
  {
    key: 'approve',
    label: i18n.approve,
    description: i18n.approveDescription,
    icon: ShieldCheck,
    warn: false,
  },
  {
    key: 'chat',
    label: i18n.chatOnly,
    description: i18n.chatOnlyDescription,
    icon: MessageCircle,
    warn: false,
  },
];

export const DEFAULT_PERMISSION_MODE = PERMISSION_MODES[0];

export function permissionMode(key: string | undefined): PermissionMode {
  return PERMISSION_MODES.find((mode) => mode.key === key) ?? DEFAULT_PERMISSION_MODE;
}

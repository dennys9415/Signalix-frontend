import { describe, expect, it } from 'vitest';
import { ChatType, MessageType, ParticipantRole, type ChatDTO, type MessageDTO } from '@signalix/contracts';
import { searchLocalMessages, mergeSearchResults } from './local-search';

const ME = 'user-me';
const PEER = 'user-peer';

const directChat: ChatDTO = {
  id: 'chat-direct',
  type: ChatType.DIRECT,
  createdBy: ME,
  createdAt: '2026-06-08T10:00:00.000Z',
  participants: [
    {
      chatId: 'chat-direct',
      userId: ME,
      role: ParticipantRole.OWNER,
      joinedAt: '2026-06-08T10:00:00.000Z',
      user: { id: ME, username: 'me', displayName: 'Me' },
    },
    {
      chatId: 'chat-direct',
      userId: PEER,
      role: ParticipantRole.MEMBER,
      joinedAt: '2026-06-08T10:00:00.000Z',
      user: { id: PEER, username: 'peer', displayName: 'Peer Person' },
    },
  ],
  unreadCount: 0,
};

const groupChat: ChatDTO = {
  id: 'chat-group',
  type: ChatType.GROUP,
  title: 'Team Lunches',
  createdBy: ME,
  createdAt: '2026-06-08T10:00:00.000Z',
  participants: [
    {
      chatId: 'chat-group',
      userId: ME,
      role: ParticipantRole.OWNER,
      joinedAt: '2026-06-08T10:00:00.000Z',
      user: { id: ME, username: 'me', displayName: 'Me' },
    },
    {
      chatId: 'chat-group',
      userId: PEER,
      role: ParticipantRole.MEMBER,
      joinedAt: '2026-06-08T10:00:00.000Z',
      user: { id: PEER, username: 'peer', displayName: 'Peer Person' },
    },
  ],
  unreadCount: 0,
};

function textMsg(id: string, chatId: string, sender: string, body: string, at: string): MessageDTO {
  return {
    id,
    chatId,
    senderId: sender,
    ciphertext: body,
    messageType: MessageType.TEXT,
    state: 'delivered' as never,
    createdAt: at,
  };
}

function fileMsg(id: string, chatId: string, sender: string, filename: string, at: string): MessageDTO {
  return {
    id,
    chatId,
    senderId: sender,
    ciphertext: JSON.stringify({ v: 1, url: 'https://x/y.bin', k: 'k', iv: 'iv', mime: 'application/pdf', size: 100, filename }),
    messageType: MessageType.FILE,
    state: 'delivered' as never,
    createdAt: at,
  };
}

const baseInputs = (msgs: MessageDTO[], chats: ChatDTO[] = [directChat, groupChat]) => ({
  chats,
  messagesByChat: msgs.reduce<Record<string, MessageDTO[]>>((acc, m) => {
    (acc[m.chatId] ??= []).push(m);
    return acc;
  }, {}),
  currentUserId: ME,
});

describe('searchLocalMessages', () => {
  it('matches text body case-insensitively', () => {
    const msgs = [
      textMsg('m1', directChat.id, PEER, 'See you at the BEACH tomorrow', '2026-06-08T12:00:00.000Z'),
      textMsg('m2', directChat.id, ME, 'sure!', '2026-06-08T12:00:30.000Z'),
    ];
    const out = searchLocalMessages('beach', baseInputs(msgs));
    expect(out.map((r) => r.messageId)).toEqual(['m1']);
    expect(out[0].senderName).toBe('Peer Person');
    expect(out[0].chatLabel).toBe('Peer Person');
  });

  it('matches the filename inside encrypted FILE metadata JSON', () => {
    const msgs = [
      fileMsg('m1', groupChat.id, PEER, 'q3-report-final.pdf', '2026-06-08T12:00:00.000Z'),
      textMsg('m2', directChat.id, PEER, 'unrelated', '2026-06-08T12:00:30.000Z'),
    ];
    const out = searchLocalMessages('report', baseInputs(msgs));
    expect(out.map((r) => r.messageId)).toEqual(['m1']);
    expect(out[0].chatLabel).toBe('Team Lunches');
  });

  it('skips messages that match neither body nor filename', () => {
    const msgs = [textMsg('m1', directChat.id, PEER, 'hi there', '2026-06-08T12:00:00.000Z')];
    expect(searchLocalMessages('beach', baseInputs(msgs))).toEqual([]);
  });

  it('skips decrypt-failure sentinel rows so they do not pollute results', () => {
    const msgs = [textMsg('m1', directChat.id, PEER, '[Unable to decrypt message]', '2026-06-08T12:00:00.000Z')];
    expect(searchLocalMessages('decrypt', baseInputs(msgs))).toEqual([]);
  });

  it('honors a single-chat filter', () => {
    const msgs = [
      textMsg('m1', directChat.id, PEER, 'pizza tonight', '2026-06-08T12:00:00.000Z'),
      textMsg('m2', groupChat.id, PEER, 'pizza tomorrow', '2026-06-08T12:00:30.000Z'),
    ];
    const out = searchLocalMessages('pizza', baseInputs(msgs), { chatId: groupChat.id });
    expect(out.map((r) => r.messageId)).toEqual(['m2']);
  });

  it('sorts newest-first', () => {
    const msgs = [
      textMsg('m-old', directChat.id, PEER, 'beach', '2026-06-08T10:00:00.000Z'),
      textMsg('m-new', directChat.id, PEER, 'beach', '2026-06-08T11:00:00.000Z'),
    ];
    const out = searchLocalMessages('beach', baseInputs(msgs));
    expect(out.map((r) => r.messageId)).toEqual(['m-new', 'm-old']);
  });
});

describe('mergeSearchResults', () => {
  it('dedupes by messageId, local entry wins (has decrypted plaintext)', () => {
    const localOnly = {
      messageId: 'm1',
      chatId: 'c1',
      chatType: ChatType.DIRECT,
      chatLabel: 'Peer',
      senderId: PEER,
      senderName: 'Peer',
      ciphertext: 'the decrypted body',
      createdAt: '2026-06-08T12:00:00.000Z',
    };
    const serverEmpty = {
      ...localOnly,
      ciphertext: '', // server sees the empty sentinel
    };
    const out = mergeSearchResults([serverEmpty], [localOnly]);
    expect(out).toHaveLength(1);
    expect(out[0].ciphertext).toBe('the decrypted body');
  });

  it('emits server-only hits when local has nothing for that id', () => {
    const server = [{
      messageId: 's1',
      chatId: 'c1',
      chatType: ChatType.DIRECT,
      chatLabel: 'Peer',
      senderId: PEER,
      senderName: 'Peer',
      ciphertext: 'legacy plaintext',
      createdAt: '2026-06-08T12:00:00.000Z',
    }];
    const out = mergeSearchResults(server, []);
    expect(out.map((r) => r.messageId)).toEqual(['s1']);
  });
});

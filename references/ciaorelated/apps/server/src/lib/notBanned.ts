export const notBannedAuthor = (now = new Date()) => ({
  author: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
});

export const notBannedOwner = (now = new Date()) => ({
  owner: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
});
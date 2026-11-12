export type AttachmentUrlPort = Readonly<{ create(blob: Blob): string; revoke(url: string): void }>;
/** Browser resources are created only after an explicit authorized download.
 * A host can inject the same two operations for an offline memory adapter. */
export function createAttachmentUrls(port: AttachmentUrlPort = { create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) }) {
  const urls = new Set<string>(); let disposed = false;
  return Object.freeze({
    create(blob: Blob) {
      if (disposed || !(blob instanceof Blob)) throw new Error("Attachment resources are unavailable.");
      const url = port.create(blob);
      if (typeof url !== "string" || !url.startsWith("blob:")) { if (typeof url === "string") port.revoke(url); throw new Error("Invalid attachment resource."); }
      urls.add(url); return url;
    },
    clear() { for (const url of urls) port.revoke(url); urls.clear(); },
    dispose() { for (const url of urls) port.revoke(url); urls.clear(); disposed = true; },
  });
}

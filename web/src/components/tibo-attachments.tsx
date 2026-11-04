import {
  TIBO_FILE_MAX_BYTES,
  TIBO_MAX_ATTACHMENTS,
  tiboFileUrl,
  type TiboAttachment,
} from "@dueboard/api/tibo";
import {
  AlertCircleIcon,
  DownloadIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  PlusIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { FILE_KIND_TAG, fileKindLabel, formatBytes, uploadErrorText, uploadTiboFile } from "@/lib/tibo-files";
import { cn } from "@/lib/utils";

// Files in Tibo's chat: the files waiting in the message box, and the files
// in a sent message. Everything is served by the user's own agent through
// the website's proxy (`tiboFileUrl`), never from anywhere else.

// ─── Files waiting to be sent ────────────────────────────────────────────────

/** A file in the message box: uploading, ready to send, or failed. */
export type DraftFile = {
  readonly key: string;
  readonly name: string;
  readonly size: number;
  /** A local preview of an image, until it's sent. */
  readonly preview: string | null;
} & (
  | { readonly status: "uploading" }
  | { readonly status: "ready"; readonly attachment: TiboAttachment }
  | { readonly status: "failed"; readonly error: string }
);

const isImageType = (type: string) => /^image\/(png|jpeg|gif|webp)$/.test(type);

/**
 * The files in the message box. Each starts uploading as soon as it's
 * added; `add` takes at most `TIBO_MAX_ATTACHMENTS` in all.
 */
export function useDraftFiles() {
  const [files, setFiles] = React.useState<readonly DraftFile[]>([]);
  const uploads = React.useRef(new Map<string, AbortController>());
  const current = React.useRef(files);
  current.current = files;
  const [notice, setNotice] = React.useState<string | null>(null);

  const update = (key: string, next: (file: DraftFile) => DraftFile) =>
    setFiles((list) => list.map((file) => (file.key === key ? next(file) : file)));

  const add = React.useCallback((incoming: Iterable<File>) => {
    const room = TIBO_MAX_ATTACHMENTS - current.current.length;
    const list = [...incoming];
    setNotice(list.length > room ? `You can send up to ${TIBO_MAX_ATTACHMENTS} files at a time.` : null);
    for (const file of list.slice(0, Math.max(room, 0))) {
      const key = crypto.randomUUID();
      const preview = isImageType(file.type) && file.size <= TIBO_FILE_MAX_BYTES ? URL.createObjectURL(file) : null;
      const base = { key, name: file.name || "File", size: file.size, preview };
      setFiles((all) => [...all, { ...base, status: "uploading" }]);
      const controller = new AbortController();
      uploads.current.set(key, controller);
      void uploadTiboFile(file, controller.signal).then((result) => {
        uploads.current.delete(key);
        if (controller.signal.aborted) return;
        update(key, (draft) =>
          result.ok
            ? { ...base, preview: draft.preview, status: "ready", attachment: result.attachment }
            : { ...base, preview: draft.preview, status: "failed", error: uploadErrorText(result.error) },
        );
      });
    }
  }, []);

  const remove = React.useCallback((key: string) => {
    uploads.current.get(key)?.abort();
    uploads.current.delete(key);
    setFiles((list) => {
      const gone = list.find((file) => file.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return list.filter((file) => file.key !== key);
    });
    setNotice(null);
  }, []);

  /** Empties the box after sending. Previews are kept a moment for the sent bubble's first paint. */
  const clear = React.useCallback(() => {
    const previews = current.current.flatMap((file) => (file.preview ? [file.preview] : []));
    setTimeout(() => previews.forEach((url) => URL.revokeObjectURL(url)), 60_000);
    setFiles([]);
    setNotice(null);
  }, []);

  React.useEffect(
    () => () => {
      for (const controller of uploads.current.values()) controller.abort();
      for (const file of current.current) if (file.preview) URL.revokeObjectURL(file.preview);
    },
    [],
  );

  const ready = files.flatMap((file) => (file.status === "ready" ? [file.attachment] : []));
  const uploading = files.some((file) => file.status === "uploading");
  return { files, ready, uploading, notice, add, remove, clear, full: files.length >= TIBO_MAX_ATTACHMENTS };
}

export type DraftFiles = ReturnType<typeof useDraftFiles>;

const KIND_ICON: Record<TiboAttachment["kind"], LucideIcon> = {
  image: ImageIcon,
  pdf: FileTextIcon,
  document: FileTextIcon,
  text: FileTextIcon,
  other: FileIcon,
};

const iconFor = (attachment: Pick<TiboAttachment, "kind" | "name">): LucideIcon =>
  fileKindLabel(attachment) === "Spreadsheet" ? FileSpreadsheetIcon : KIND_ICON[attachment.kind];

/** The + at the left of the message box, with its hidden file picker. */
export function AttachButton({ drafts, disabled, className }: { drafts: DraftFiles; disabled: boolean; className?: string }) {
  const input = React.useRef<HTMLInputElement>(null);
  // `aria-disabled`, not `disabled`: the input group fades whole when it holds a disabled control.
  const off = disabled || drafts.full;
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files) drafts.add(event.target.files);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Add files"
        title="Add files"
        aria-disabled={off}
        onClick={() => {
          if (!off) input.current?.click();
        }}
        className={cn(
          "rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary aria-disabled:pointer-events-none aria-disabled:opacity-50",
          className,
        )}
      >
        <PlusIcon className="size-5" />
      </Button>
    </>
  );
}

/** The files in the message box, above the text. */
export function DraftTray({ drafts }: { drafts: DraftFiles }) {
  if (drafts.files.length === 0 && !drafts.notice) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {drafts.files.length > 0 && (
        <ul aria-label="Files to send" className="flex w-full gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
          {drafts.files.map((file) => (
            <DraftTile key={file.key} file={file} onRemove={() => drafts.remove(file.key)} />
          ))}
        </ul>
      )}
      {drafts.notice && <p className="text-xs text-muted-foreground">{drafts.notice}</p>}
    </div>
  );
}

function DraftTile({ file, onRemove }: { file: DraftFile; onRemove: () => void }) {
  const failed = file.status === "failed";
  const uploading = file.status === "uploading";
  const kind = file.status === "ready" ? file.attachment.kind : file.preview ? "image" : "other";
  const Icon = file.status === "ready" ? iconFor(file.attachment) : FileIcon;
  return (
    <li
      className={cn(
        "relative flex h-16 shrink-0 items-center overflow-hidden rounded-xl border bg-background/70",
        file.preview ? "w-16" : "w-48 gap-2.5 pr-8 pl-2",
        failed ? "border-destructive/60" : "border-composer-border/70",
      )}
      title={failed ? file.error : file.name}
    >
      {file.preview ? (
        <img src={file.preview} alt={file.name} className={cn("size-full object-cover", (uploading || failed) && "opacity-50")} />
      ) : (
        <>
          <span data-tag={FILE_KIND_TAG[kind]} className="grid size-10 shrink-0 place-items-center rounded-lg bg-tag-soft text-tag-ink">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col text-xs leading-tight">
            <span className="truncate font-medium">{file.name}</span>
            <span className={cn("truncate", failed ? "text-destructive" : "text-muted-foreground")}>
              {failed ? "Didn't upload" : uploading ? "Uploading…" : formatBytes(file.size)}
            </span>
          </span>
        </>
      )}
      {(uploading || (failed && file.preview)) && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden={!failed}>
          {uploading ? (
            <Spinner className={cn("size-5", file.preview ? "text-white drop-shadow" : "text-muted-foreground")} />
          ) : (
            <AlertCircleIcon className="size-5 text-destructive" />
          )}
        </span>
      )}
      <span className="sr-only">{failed ? `${file.name}: ${file.error}` : uploading ? `${file.name}, uploading` : file.name}</span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-foreground/70 text-background outline-none hover:bg-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <XIcon className="size-3" />
      </button>
    </li>
  );
}

/** "Drop files to send to Tibo", over the thread while files are dragged in. */
export function useFileDrop(onFiles: (files: FileList) => void, enabled: boolean) {
  const [over, setOver] = React.useState(false);
  const depth = React.useRef(0);
  const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");
  const handlers = enabled
    ? {
        onDragEnter: (event: React.DragEvent) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          depth.current += 1;
          setOver(true);
        },
        onDragOver: (event: React.DragEvent) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event: React.DragEvent) => {
          if (!hasFiles(event)) return;
          depth.current = Math.max(depth.current - 1, 0);
          if (depth.current === 0) setOver(false);
        },
        onDrop: (event: React.DragEvent) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          depth.current = 0;
          setOver(false);
          if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
        },
      }
    : {};
  return { over, handlers };
}

export function DropOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-2 z-30 grid animate-in place-items-center rounded-3xl border-2 border-dashed border-primary/60 bg-background/80 fade-in-0 motion-reduce:animate-none"
    >
      <div className="flex flex-col items-center gap-2 text-primary">
        <PlusIcon className="size-7" />
        <p className="text-sm font-medium">Drop files to send to Tibo</p>
      </div>
    </div>
  );
}

// ─── Files in a sent message ─────────────────────────────────────────────────

/**
 * A message's files, at the top of its bubble: photos first (one at its
 * own shape, several in a grid), then a card for each other file.
 */
export function MessageAttachments({
  attachments,
  hasText,
  mine,
}: {
  attachments: readonly TiboAttachment[];
  /** Text follows: the photos square off at the bottom. */
  hasText: boolean;
  mine: boolean;
}) {
  const photos = attachments.filter((attachment) => attachment.kind === "image");
  const files = attachments.filter((attachment) => attachment.kind !== "image");
  const [viewing, setViewing] = React.useState<TiboAttachment | null>(null);
  return (
    <div className="flex flex-col gap-1">
      {photos.length > 0 && <PhotoGrid photos={photos} open={setViewing} squareBottom={hasText || files.length > 0} />}
      {files.map((file) => (
        <FileCard key={file.id} file={file} mine={mine} />
      ))}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function PhotoGrid({
  photos,
  open,
  squareBottom,
}: {
  photos: readonly TiboAttachment[];
  open: (photo: TiboAttachment) => void;
  squareBottom: boolean;
}) {
  const single = photos.length === 1;
  return (
    <div
      // A set width (never the picture's own, which would stretch the bubble
      // past it), clipped by the bubble's corners.
      className={cn(
        "grid gap-1 overflow-hidden rounded-[inherit]",
        single ? "w-72 max-w-full" : "w-80 max-w-full grid-cols-2",
        squareBottom && "rounded-b-md",
      )}
    >
      {photos.map((photo, index) => {
        const wide = photos.length === 3 && index === 0;
        const ratio = single && photo.width && photo.height ? Math.min(Math.max(photo.width / photo.height, 0.5), 2) : null;
        return (
          <button
            key={photo.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              open(photo);
            }}
            aria-label={`Open ${photo.name}`}
            className={cn(
              "group/photo relative block overflow-hidden bg-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset",
              !single && (wide ? "col-span-2 aspect-[2/1]" : "aspect-square"),
            )}
            style={ratio ? { aspectRatio: ratio } : single ? { aspectRatio: "4 / 3" } : undefined}
          >
            <img
              src={tiboFileUrl(photo.id)}
              alt={photo.name}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover/photo:scale-[1.02] motion-reduce:transition-none"
            />
          </button>
        );
      })}
    </div>
  );
}

export function FileCard({ file, mine }: { file: TiboAttachment; mine: boolean }) {
  const Icon = iconFor(file);
  // PDFs open in a new tab; anything else is saved.
  const opens = file.kind === "pdf";
  return (
    <a
      href={tiboFileUrl(file.id, !opens)}
      {...(opens ? { target: "_blank", rel: "noopener noreferrer" } : { download: file.name })}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "flex w-[min(17rem,100%)] items-center gap-2.5 rounded-[0.8rem] p-2 pr-3 no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        mine ? "bg-bubble-me-foreground/12 hover:bg-bubble-me-foreground/18" : "bg-muted hover:bg-muted/70",
      )}
    >
      <span data-tag={FILE_KIND_TAG[file.kind]} className="grid size-10 shrink-0 place-items-center rounded-lg bg-tag-soft text-tag-ink">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <span className={cn("text-xs", mine ? "text-bubble-me-foreground/75" : "text-muted-foreground")}>
          {fileKindLabel(file)}, {formatBytes(file.size)}
        </span>
      </span>
      <DownloadIcon aria-hidden="true" className={cn("size-4 shrink-0", mine ? "text-bubble-me-foreground/75" : "text-muted-foreground")} />
      <span className="sr-only">{opens ? "Open" : "Save"}</span>
    </a>
  );
}

/** A photo, full size, with its name and Save. */
export function PhotoViewer({ photo, onClose }: { photo: TiboAttachment | null; onClose: () => void }) {
  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-2 p-2 sm:max-w-[min(56rem,calc(100%-2rem))]">
        {photo && (
          <>
            <img
              src={tiboFileUrl(photo.id)}
              alt={photo.name}
              className="max-h-[78vh] w-full rounded-lg bg-muted object-contain"
            />
            <div className="flex items-center gap-3 px-1 pb-0.5">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm font-medium">{photo.name}</DialogTitle>
                <DialogDescription className="text-xs">
                  {photo.width && photo.height ? `${photo.width} × ${photo.height}, ` : ""}
                  {formatBytes(photo.size)}
                </DialogDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={tiboFileUrl(photo.id, true)} download={photo.name}>
                  <DownloadIcon />
                  Save
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

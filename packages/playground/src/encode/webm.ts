// A WebM writer for the video chunks the browser's encoder makes: the EBML header, a segment with
// a seek head, the segment's information (with its duration), one video track, clusters of simple
// blocks that each start at a keyframe, and cues for seeking.
import { messages } from "../messages/index.js";

/** A compressed frame: its bytes, its time in microseconds and whether it is a keyframe. */
export interface EncodedFrame {
  readonly data: Uint8Array;
  readonly timestamp: number;
  readonly key: boolean;
}

const encoder = new TextEncoder();

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** An element ID as its bytes (IDs keep their marker bits). */
function id(value: number): Uint8Array {
  const bytes: number[] = [];
  for (let v = value; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Uint8Array.from(bytes);
}

/** A data size as an EBML variable-length integer, in as few bytes as it needs. */
function size(value: number): Uint8Array {
  for (let length = 1; length <= 8; length++) {
    if (value < 2 ** (7 * length) - 1) {
      const out = new Uint8Array(length);
      let v = value;
      for (let i = length - 1; i >= 0; i--) {
        out[i] = v & 0xff;
        v = Math.floor(v / 256);
      }
      out[0]! |= 1 << (8 - length);
      return out;
    }
  }
  throw new Error(messages().video.webmTooLarge);
}

function element(tag: number, data: Uint8Array): Uint8Array {
  return concat([id(tag), size(data.length), data]);
}

const master = (tag: number, ...children: Uint8Array[]) => element(tag, concat(children));

/** An unsigned integer in `bytes` bytes, or as few as it needs. */
function uint(tag: number, value: number, bytes?: number): Uint8Array {
  const out: number[] = [];
  for (let v = value; v > 0 || out.length === 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  while (bytes !== undefined && out.length < bytes) out.unshift(0);
  return element(tag, Uint8Array.from(out));
}

function float(tag: number, value: number): Uint8Array {
  const data = new Uint8Array(8);
  new DataView(data.buffer).setFloat64(0, value);
  return element(tag, data);
}

const string = (tag: number, value: string) => element(tag, encoder.encode(value));

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  FlagLacing: 0x9c,
  CodecID: 0x86,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
} as const;

export interface WebmOptions {
  readonly codec: "V_VP9" | "V_VP8";
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly application: string;
}

/** A WebM file of encoded frames in decoding order. Times are kept to the millisecond. */
export function writeWebm(frames: readonly EncodedFrame[], options: WebmOptions): Uint8Array {
  const header = master(
    ID.EBML,
    uint(ID.EBMLVersion, 1),
    uint(ID.EBMLReadVersion, 1),
    uint(ID.EBMLMaxIDLength, 4),
    uint(ID.EBMLMaxSizeLength, 8),
    string(ID.DocType, "webm"),
    uint(ID.DocTypeVersion, 4),
    uint(ID.DocTypeReadVersion, 2),
  );
  const info = master(
    ID.Info,
    uint(ID.TimecodeScale, 1_000_000),
    string(ID.MuxingApp, options.application),
    string(ID.WritingApp, options.application),
    float(ID.Duration, options.durationMs),
  );
  const tracks = master(
    ID.Tracks,
    master(
      ID.TrackEntry,
      uint(ID.TrackNumber, 1),
      uint(ID.TrackUID, 1),
      uint(ID.TrackType, 1),
      uint(ID.FlagLacing, 0),
      string(ID.CodecID, options.codec),
      master(ID.Video, uint(ID.PixelWidth, options.width), uint(ID.PixelHeight, options.height)),
    ),
  );

  // Clusters: one per keyframe, or sooner when a block would be too far from the cluster's time.
  const clusters: { time: number; blocks: Uint8Array[] }[] = [];
  for (const frame of frames) {
    const time = Math.round(frame.timestamp / 1000);
    const current = clusters[clusters.length - 1];
    if (!current || frame.key || time - current.time > 30_000) {
      clusters.push({ time, blocks: [] });
    }
    const cluster = clusters[clusters.length - 1]!;
    const relative = time - cluster.time;
    const block = new Uint8Array(4 + frame.data.length);
    block[0] = 0x81; // track 1
    new DataView(block.buffer).setInt16(1, relative);
    block[3] = frame.key ? 0x80 : 0x00;
    block.set(frame.data, 4);
    cluster.blocks.push(element(ID.SimpleBlock, block));
  }
  const clusterBytes = clusters.map((c) =>
    master(ID.Cluster, uint(ID.Timecode, c.time), ...c.blocks),
  );

  // Positions are relative to the start of the segment's data; the seek head comes first and
  // has a fixed size, since its positions are written in eight bytes.
  const seekHeadFor = (positions: { info: number; tracks: number; cues: number }) =>
    master(
      ID.SeekHead,
      master(ID.Seek, element(ID.SeekID, id(ID.Info)), uint(ID.SeekPosition, positions.info, 8)),
      master(
        ID.Seek,
        element(ID.SeekID, id(ID.Tracks)),
        uint(ID.SeekPosition, positions.tracks, 8),
      ),
      master(ID.Seek, element(ID.SeekID, id(ID.Cues)), uint(ID.SeekPosition, positions.cues, 8)),
    );
  const seekSize = seekHeadFor({ info: 0, tracks: 0, cues: 0 }).length;
  const infoAt = seekSize;
  const tracksAt = infoAt + info.length;
  let at = tracksAt + tracks.length;
  const clusterAt: number[] = [];
  for (const cluster of clusterBytes) {
    clusterAt.push(at);
    at += cluster.length;
  }
  const cues = master(
    ID.Cues,
    ...clusters.map((cluster, i) =>
      master(
        ID.CuePoint,
        uint(ID.CueTime, cluster.time),
        master(
          ID.CueTrackPositions,
          uint(ID.CueTrack, 1),
          uint(ID.CueClusterPosition, clusterAt[i]!),
        ),
      ),
    ),
  );
  const seekHead = seekHeadFor({ info: infoAt, tracks: tracksAt, cues: at });
  const segment = master(ID.Segment, seekHead, info, tracks, ...clusterBytes, cues);
  return concat([header, segment]);
}

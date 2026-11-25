// Numbered frames -> silent H.264 MP4 (no audio track at all), for the CrazyGames preview videos.
//   encode <framesDir> <out.mp4> [fps=30] [bitsPerSecond=12000000]
// Frames are every .jpg/.png in framesDir in name order, all the size of the first. Tagged Rec. 709, High profile.
// Build (the Command Line Tools' Swift module map is broken; the overlay hides it):
//   : > empty.modulemap; write overlay.yaml mapping /Library/Developer/CommandLineTools/usr/include/swift/module.modulemap to it
//   swiftc -O -vfsoverlay overlay.yaml -Xcc -ivfsoverlay -Xcc overlay.yaml tools/encode.swift -o encode
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }

let args = CommandLine.arguments
if args.count < 3 { fail("usage: encode <framesDir> <out.mp4> [fps=30] [bitsPerSecond=12000000]") }
let dir = URL(fileURLWithPath: args[1]), out = URL(fileURLWithPath: args[2])
let fps = Int32(args.count > 3 ? Int(args[3]) ?? 30 : 30), bps = args.count > 4 ? Int(args[4]) ?? 12_000_000 : 12_000_000
let names = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? [])
  .filter { $0.lowercased().hasSuffix(".jpg") || $0.lowercased().hasSuffix(".png") }.sorted()
if names.isEmpty { fail("no .jpg/.png frames in \(dir.path)") }

func load(_ name: String) -> CGImage {
  guard let src = CGImageSourceCreateWithURL(dir.appendingPathComponent(name) as CFURL, nil),
        let im = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("cannot read \(name)") }
  return im
}
let first = load(names[0]), W = first.width, H = first.height

try? FileManager.default.removeItem(at: out)
let writer: AVAssetWriter
do { writer = try AVAssetWriter(outputURL: out, fileType: .mp4) } catch { fail("writer: \(error)") }
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                              AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                              AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bps, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                                    AVVideoMaxKeyFrameIntervalKey: Int(fps), AVVideoExpectedSourceFrameRateKey: Int(fps)]
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input)   // video only: no audio input is ever added, so the file has no sound track
writer.shouldOptimizeForNetworkUse = true   // fast start: moov before mdat, so a player shows frame 0 without fetching the tail
if !writer.startWriting() { fail("startWriting: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

let space = CGColorSpace(name: CGColorSpace.sRGB)!
for (i, name) in names.enumerated() {
  let im = i == 0 ? first : load(name)
  if im.width != W || im.height != H { fail("\(name) is \(im.width)x\(im.height), expected \(W)x\(H)") }
  while !input.isReadyForMoreMediaData { usleep(2000) }
  guard let pool = adaptor.pixelBufferPool else { fail("no pixel buffer pool: \(String(describing: writer.error))") }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
  guard let buf = pb else { fail("no pixel buffer") }
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
                      bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: space,
                      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(im, in: CGRect(x: 0, y: 0, width: W, height: H))
  CVPixelBufferUnlockBaseAddress(buf, [])
  if !adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) { fail("append \(name): \(String(describing: writer.error))") }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fail("finish: \(String(describing: writer.error))") }
// the fast-start pass leaves its mdat-only scratch copy (<name>.sb-*) next to the output
let outDir = out.deletingLastPathComponent(), scratch = out.lastPathComponent + ".sb-"
for f in (try? FileManager.default.contentsOfDirectory(atPath: outDir.path)) ?? [] where f.hasPrefix(scratch) {
  try? FileManager.default.removeItem(at: outDir.appendingPathComponent(f))
}
let size = ((try? FileManager.default.attributesOfItem(atPath: out.path)[.size]) as? Int) ?? 0
print("\(out.path): \(W)x\(H), \(names.count) frames at \(fps) fps = \(String(format: "%.2f", Double(names.count) / Double(fps))) s, \(String(format: "%.2f", Double(size) / 1_048_576)) MB")

// phone-drop — move whatever the iPhone drops into iCloud Drive/To Mac
// into ~/Downloads/From iPhone, then empty the inbox.
//
// iCloud is the transport, so the phone and the Mac find each other through
// the Apple ID on any network: no shared WiFi, no server, no token to expire.
//
// Run by the LaunchAgent com.chaelri.phonedrop on every change to the inbox
// (WatchPaths) plus a 60 s fallback. Each run drains the inbox and exits.
//
// A compiled binary rather than a python script on purpose: run from launchd,
// /usr/bin/python3 gets "Operation not permitted" on the iCloud Drive folder
// (TCC), while this binary, as its own responsible process, reads it fine.
import Foundation

let fm = FileManager.default
let home = fm.homeDirectoryForCurrentUser.path
let inbox = home + "/Library/Mobile Documents/com~apple~CloudDocs/To Mac"
let outbox = home + "/Downloads/From iPhone"

let SF_DATALESS: UInt32 = 0x4000_0000  // placeholder: bytes still in iCloud
let settleSeconds: UInt32 = 3          // must stop growing this long before we take it

func log(_ msg: String) {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd HH:mm:ss"
    print(f.string(from: Date()), msg)
    fflush(stdout)
}

func run(_ exe: String, _ args: [String]) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: exe)
    p.arguments = args  // argv, never a shell string: filenames can't break out
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    try? p.run()
    p.waitUntilExit()
}

func flags(_ path: String) -> UInt32? {
    var st = stat()
    return stat(path, &st) == 0 ? st.st_flags : nil
}

func size(_ path: String) -> Int64? {
    var st = stat()
    return stat(path, &st) == 0 ? st.st_size : nil
}

/// Ask iCloud to download a placeholder and wait until the bytes are local.
func materialise(_ path: String) -> Bool {
    guard let f = flags(path) else { return false }
    if f & SF_DATALESS == 0 { return true }
    run("/usr/bin/brctl", ["download", path])
    for _ in 0..<600 {  // up to 10 min for a long video on a slow line
        sleep(1)
        guard let f = flags(path) else { return false }
        if f & SF_DATALESS == 0 { return true }
    }
    return false
}

func settled(_ path: String) -> Bool {
    let a = size(path)
    sleep(settleSeconds)
    return a != nil && size(path) == a
}

func uniqueDest(_ name: String) -> String {
    let ext = (name as NSString).pathExtension
    let stem = (name as NSString).deletingPathExtension
    var dest = outbox + "/" + name
    var n = 2
    while fm.fileExists(atPath: dest) {
        dest = outbox + "/" + stem + " (\(n))" + (ext.isEmpty ? "" : "." + ext)
        n += 1
    }
    return dest
}

func notify(_ moved: [String]) {
    let text = moved.count == 1 ? (moved[0] as NSString).lastPathComponent : "\(moved.count) files"
    let script = """
        on run argv
        display notification (item 1 of argv) with title "From iPhone" sound name "Glass"
        end run
        """
    run("/usr/bin/osascript", ["-e", script, text])
}

try? fm.createDirectory(atPath: inbox, withIntermediateDirectories: true)
try? fm.createDirectory(atPath: outbox, withIntermediateDirectories: true)

let names: [String]
do {
    names = try fm.contentsOfDirectory(atPath: inbox).sorted()
} catch {
    log("cannot read inbox (TCC? try Full Disk Access for this binary): \(error.localizedDescription)")
    exit(1)
}

var moved: [String] = []
// hidden files and legacy ".name.icloud" stubs are iCloud bookkeeping
for name in names where !name.hasPrefix(".") {
    let src = inbox + "/" + name
    guard materialise(src), settled(src) else {
        log("skip (not ready): \(name)")
        continue
    }
    let dest = uniqueDest(name)
    do {
        try fm.moveItem(atPath: src, toPath: dest)  // folders too
        moved.append(dest)
        log("moved: \(name) -> \(dest)")
    } catch {  // one bad file must not strand the rest
        log("error on \(name): \(error.localizedDescription)")
    }
}

if !moved.isEmpty {
    notify(moved)
    run("/usr/bin/open", ["-R", moved.last!])
}

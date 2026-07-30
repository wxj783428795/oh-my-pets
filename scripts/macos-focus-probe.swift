import AppKit
import Foundation

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(
        Data("用法：macos-focus-probe <ready-path> <result-path>\n".utf8)
    )
    exit(2)
}

final class FocusProbeDelegate: NSObject, NSApplicationDelegate {
    private let readyPath: String
    private let resultPath: String
    private var window: NSWindow?
    private var input: NSTextField?

    init(readyPath: String, resultPath: String) {
        self.readyPath = readyPath
        self.resultPath = resultPath
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 96),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window.title = "Oh My Pets 启动焦点探针"
        window.center()

        let input = NSTextField(frame: NSRect(x: 20, y: 28, width: 380, height: 32))
        input.isEditable = true
        input.isSelectable = true
        window.contentView?.addSubview(input)

        self.window = window
        self.input = input
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        window.makeFirstResponder(input)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            FileManager.default.createFile(
                atPath: self.readyPath,
                contents: Data(),
                attributes: nil
            )
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
            let count = self.input?.stringValue.count ?? 0
            do {
                try "\(count)\n".write(
                    toFile: self.resultPath,
                    atomically: true,
                    encoding: .utf8
                )
                NSApplication.shared.terminate(nil)
            } catch {
                FileHandle.standardError.write(
                    Data("写入焦点探针结果失败：\(error)\n".utf8)
                )
                exit(1)
            }
        }
    }
}

let application = NSApplication.shared
let delegate = FocusProbeDelegate(
    readyPath: CommandLine.arguments[1],
    resultPath: CommandLine.arguments[2]
)
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()

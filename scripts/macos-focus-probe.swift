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
    private var firstResponderWasLost = false
    private var finished = false

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
            self.monitorFirstResponder()
            FileManager.default.createFile(
                atPath: self.readyPath,
                contents: Data(),
                attributes: nil
            )
        }
        // PID 采样会跨越应用启动、原生位置更新和召回；给多次 osascript 查询
        // 留出足够时间，避免探针自身先退出而把焦点还给其他应用。
        DispatchQueue.main.asyncAfter(deadline: .now() + 8.0) {
            self.finished = true
            let count = self.input?.stringValue.count ?? 0
            do {
                let firstResponderState = self.firstResponderWasLost ? "lost" : "preserved"
                try "\(count)\n\(firstResponderState)\n".write(
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

    private func monitorFirstResponder() {
        guard let window, let input else {
            firstResponderWasLost = true
            return
        }
        if !window.isKeyWindow || window.firstResponder !== input.currentEditor() {
            firstResponderWasLost = true
        }
        if !finished {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.01) {
                self.monitorFirstResponder()
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

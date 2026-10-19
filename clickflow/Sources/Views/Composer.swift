import SwiftUI
import AppKit

/// A small Discord message editor: a plain-text NSTextView (so the toolbar can wrap the
/// current selection), Discord-markdown buttons, variable chips and a rendered preview.
struct MessageComposer: View {
    @Binding var text: String
    let variables: [(token: String, help: String)]
    @StateObject private var controller = ComposerController()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                fmt("bold", "B", .bold) { controller.wrap("**", "**", placeholder: "bold") }
                fmt("italic", "I", .regular, italic: true) { controller.wrap("*", "*", placeholder: "italic") }
                fmt("underline", "U", .regular, underline: true) { controller.wrap("__", "__", placeholder: "underlined") }
                fmt("strikethrough", "S", .regular, strike: true) { controller.wrap("~~", "~~", placeholder: "struck") }
                Divider().frame(height: 16)
                icon("Inline code", "chevron.left.forwardslash.chevron.right") { controller.wrap("`", "`", placeholder: "code") }
                icon("Code block", "curlybraces") { controller.wrap("```\n", "\n```", placeholder: "code") }
                icon("Quote", "text.quote") { controller.prefixLines("> ") }
                icon("Heading", "textformat.size.larger") { controller.prefixLines("## ") }
                icon("List", "list.bullet") { controller.prefixLines("- ") }
                icon("Spoiler", "eye.slash") { controller.wrap("||", "||", placeholder: "spoiler") }
                Spacer(minLength: 8)
                ForEach(variables, id: \.token) { v in
                    Button(v.token) { controller.insert(v.token) }
                        .font(.system(.caption, design: .monospaced))
                        .buttonStyle(.plain)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.indigo.opacity(0.15)))
                        .help("Replaced with \(v.help) when it runs")
                }
            }
            ComposerTextView(text: $text, controller: controller)
                .frame(minHeight: 64, maxHeight: 140)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(nsColor: .separatorColor)))
            if !text.isEmpty {
                HStack(alignment: .top, spacing: 6) {
                    Text("Preview").font(.caption).foregroundStyle(.secondary)
                    Text(DiscordPreview.render(text))
                        .font(.callout)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color(red: 0.19, green: 0.2, blue: 0.23)))
                        .foregroundStyle(Color(white: 0.9))
                }
            }
        }
    }

    private func fmt(_ help: String, _ letter: String, _ weight: Font.Weight, italic: Bool = false,
                     underline: Bool = false, strike: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(letter)
                .font(.system(size: 13, weight: weight == .bold ? .bold : .medium, design: .serif))
                .italic(italic)
                .underline(underline)
                .strikethrough(strike)
                .frame(width: 24, height: 22)
                .background(RoundedRectangle(cornerRadius: 5).fill(Color.primary.opacity(0.07)))
        }
        .buttonStyle(.plain)
        .help(help.capitalized)
    }

    private func icon(_ help: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .frame(width: 24, height: 22)
                .background(RoundedRectangle(cornerRadius: 5).fill(Color.primary.opacity(0.07)))
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

/// Drives the text view from the toolbar.
final class ComposerController: ObservableObject {
    weak var textView: NSTextView?

    private func replace(_ range: NSRange, with s: String, select: NSRange) {
        guard let tv = textView, tv.shouldChangeText(in: range, replacementString: s) else { return }
        tv.replaceCharacters(in: range, with: s)
        tv.didChangeText()
        tv.setSelectedRange(select)
        tv.window?.makeFirstResponder(tv)
    }

    /// Wraps the selection (or a placeholder, left selected so typing replaces it).
    func wrap(_ pre: String, _ post: String, placeholder: String) {
        guard let tv = textView else { return }
        let r = tv.selectedRange()
        let selected = (tv.string as NSString).substring(with: r)
        let body = selected.isEmpty ? placeholder : selected
        let pre16 = (pre as NSString).length
        replace(r, with: pre + body + post, select: NSRange(location: r.location + pre16, length: (body as NSString).length))
    }

    /// Puts a prefix at the start of every line the selection touches.
    func prefixLines(_ prefix: String) {
        guard let tv = textView else { return }
        let ns = tv.string as NSString
        let lines = ns.lineRange(for: tv.selectedRange())
        let block = ns.substring(with: lines)
        let trailingNewline = block.hasSuffix("\n")
        let body = trailingNewline ? String(block.dropLast()) : block
        let out = body.components(separatedBy: "\n").map { prefix + $0 }.joined(separator: "\n") + (trailingNewline ? "\n" : "")
        replace(lines, with: out, select: NSRange(location: lines.location + (out as NSString).length - (trailingNewline ? 1 : 0), length: 0))
    }

    func insert(_ s: String) {
        guard let tv = textView else { return }
        let r = tv.selectedRange()
        replace(r, with: s, select: NSRange(location: r.location + (s as NSString).length, length: 0))
    }
}

struct ComposerTextView: NSViewRepresentable {
    @Binding var text: String
    let controller: ComposerController

    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        scroll.drawsBackground = false
        scroll.borderType = .noBorder
        if let tv = scroll.documentView as? NSTextView {
            tv.isRichText = false
            tv.allowsUndo = true
            tv.isAutomaticQuoteSubstitutionEnabled = false
            tv.isAutomaticDashSubstitutionEnabled = false
            tv.isAutomaticTextReplacementEnabled = false
            tv.font = .monospacedSystemFont(ofSize: 12.5, weight: .regular)
            tv.textContainerInset = NSSize(width: 6, height: 6)
            tv.drawsBackground = false
            tv.string = text
            tv.delegate = context.coordinator
            controller.textView = tv
        }
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.text = $text
        guard let tv = scroll.documentView as? NSTextView else { return }
        controller.textView = tv
        if tv.string != text { tv.string = text }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var text: Binding<String>
        init(text: Binding<String>) { self.text = text }

        func textDidChange(_ n: Notification) {
            guard let tv = n.object as? NSTextView else { return }
            if text.wrappedValue != tv.string { text.wrappedValue = tv.string }
        }
    }
}

/// Close-enough rendering of Discord markdown for the preview. Variables stay visible as
/// tokens; block syntax (```, >, ##) is shown as typed.
enum DiscordPreview {
    static func render(_ s: String) -> AttributedString {
        // Discord's __underline__ isn't Markdown; show it as plain text with the markers removed.
        let prepared = s.replacingOccurrences(of: "__", with: "").replacingOccurrences(of: "||", with: "▒")
        let opts = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: prepared, options: opts)) ?? AttributedString(s)
    }
}

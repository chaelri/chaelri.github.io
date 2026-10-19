import SwiftUI

/// The macOS 26 SDK declares `@State` as a macro whose plugin ships with Xcode, not
/// with the Command Line Tools this project builds with. Spelling the attribute
/// through a typealias picks the plain property-wrapper type instead.
typealias ViewState = SwiftUI.State

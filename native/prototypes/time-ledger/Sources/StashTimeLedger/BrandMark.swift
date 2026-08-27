import AppKit
import SwiftUI

enum BrandAssets {
    static let appIcon = image(named: "AppIcon-v2") ?? image(named: "AppIcon")
    static let sidebarArtwork = image(named: "SidebarArtwork")

    private static func image(named name: String) -> NSImage? {
        if let url = Bundle.main.url(forResource: name, withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            return image
        }

        if let url = Bundle.module.url(forResource: name, withExtension: "png") {
            return NSImage(contentsOf: url)
        }

        return nil
    }
}

struct BrandMark: View {
    let size: CGFloat

    var body: some View {
        Group {
            if let image = BrandAssets.appIcon {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .antialiased(true)
            } else {
                Image(systemName: "square.stack.3d.up.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(.primary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct SidebarArtwork: View {
    var body: some View {
        Group {
            if let image = BrandAssets.sidebarArtwork {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .antialiased(true)
                    .scaledToFill()
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 106)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(LedgerDesign.hairline, lineWidth: 1)
        }
        .accessibilityHidden(true)
    }
}

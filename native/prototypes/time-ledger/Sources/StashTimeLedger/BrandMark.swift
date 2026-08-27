import AppKit
import SwiftUI

struct BrandMark: View {
    let size: CGFloat

    var body: some View {
        Group {
            if let image = Self.image {
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

    private static let image: NSImage? = {
        if let url = Bundle.main.url(forResource: "AppIcon", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            return image
        }

        if let url = Bundle.module.url(forResource: "AppIcon", withExtension: "png") {
            return NSImage(contentsOf: url)
        }

        return nil
    }()
}

struct SidebarArtwork: View {
    var body: some View {
        Group {
            if let image = Self.image {
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

    private static let image: NSImage? = {
        if let url = Bundle.main.url(forResource: "SidebarArtwork", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            return image
        }

        if let url = Bundle.module.url(forResource: "SidebarArtwork", withExtension: "png") {
            return NSImage(contentsOf: url)
        }

        return nil
    }()
}

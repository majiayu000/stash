#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
PACKAGE_DIR=${SCRIPT_DIR:h}
OUTPUT_APP=${1:-"$PACKAGE_DIR/.build/app/Stash Time Ledger.app"}
CONTENTS_DIR="$OUTPUT_APP/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
ICON_SOURCE="$PACKAGE_DIR/Sources/StashTimeLedger/Resources/AppIcon-v2.png"
SIDEBAR_ART_SOURCE="$PACKAGE_DIR/Sources/StashTimeLedger/Resources/SidebarArtwork.png"
ICONSET_DIR="$PACKAGE_DIR/.build/StashTimeLedger.iconset"
ICON_OUTPUT="$PACKAGE_DIR/.build/StashTimeLedger.icns"

swift build -c release --package-path "$PACKAGE_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$ICONSET_DIR"
cp "$PACKAGE_DIR/.build/release/StashTimeLedger" "$MACOS_DIR/StashTimeLedger"
cp "$ICON_SOURCE" "$RESOURCES_DIR/AppIcon-v2.png"
cp "$SIDEBAR_ART_SOURCE" "$RESOURCES_DIR/SidebarArtwork.png"

sips -z 16 16 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
cp "$ICON_SOURCE" "$ICONSET_DIR/icon_512x512@2x.png"
iconutil -c icns "$ICONSET_DIR" -o "$ICON_OUTPUT"
cp "$ICON_OUTPUT" "$RESOURCES_DIR/StashTimeLedger.icns"

plutil -create xml1 "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleDevelopmentRegion -string en "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleExecutable -string StashTimeLedger "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleIdentifier -string local.stash.time-ledger "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleIconFile -string StashTimeLedger.icns "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleIconName -string StashTimeLedger "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleInfoDictionaryVersion -string 6.0 "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleName -string "Stash Time Ledger" "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleDisplayName -string "Stash" "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundlePackageType -string APPL "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleShortVersionString -string 0.1.0 "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleVersion -string 1 "$CONTENTS_DIR/Info.plist"
plutil -insert LSMinimumSystemVersion -string 14.0 "$CONTENTS_DIR/Info.plist"
plutil -insert NSHighResolutionCapable -bool true "$CONTENTS_DIR/Info.plist"

codesign --force --sign - "$OUTPUT_APP"
print -r -- "$OUTPUT_APP"

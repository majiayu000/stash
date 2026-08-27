#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
PACKAGE_DIR=${SCRIPT_DIR:h}
OUTPUT_APP=${1:-"$PACKAGE_DIR/.build/app/Stash Time Ledger.app"}
CONTENTS_DIR="$OUTPUT_APP/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

swift build -c release --package-path "$PACKAGE_DIR"
mkdir -p "$MACOS_DIR"
cp "$PACKAGE_DIR/.build/release/StashTimeLedger" "$MACOS_DIR/StashTimeLedger"

plutil -create xml1 "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleDevelopmentRegion -string en "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleExecutable -string StashTimeLedger "$CONTENTS_DIR/Info.plist"
plutil -insert CFBundleIdentifier -string local.stash.time-ledger "$CONTENTS_DIR/Info.plist"
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

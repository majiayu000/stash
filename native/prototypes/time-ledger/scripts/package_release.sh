#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
package_dir="${script_dir:h}"
dist_dir="$package_dir/.build/app"
app_dir="$dist_dir/Stash Time Ledger.app"

"$script_dir/package_app.sh" "$app_dir"

version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_dir/Contents/Info.plist")"
zip_path="$dist_dir/Stash-$version.zip"
checksum_path="$zip_path.sha256"
identity="${STASH_SIGNING_IDENTITY:-${APPLE_SIGNING_IDENTITY:--}}"
created_api_key_path=""

cleanup() {
    if [[ -n "$created_api_key_path" ]]; then
        rm -f "$created_api_key_path"
    fi
}
trap cleanup EXIT

has_notarization_credentials() {
    [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" ]] || return 1
    [[ -n "${APPLE_API_KEY_PATH:-}" || -n "${APPLE_API_KEY_CONTENT:-}" ]]
}

notarize_app() {
    local api_key_path="${APPLE_API_KEY_PATH:-}"
    local submit_zip="$dist_dir/.Stash-notarize.zip"

    if [[ -z "$api_key_path" ]]; then
        created_api_key_path="$(mktemp "${TMPDIR:-/tmp}/stash-authkey.XXXXXX.p8")"
        printf '%s' "$APPLE_API_KEY_CONTENT" | base64 --decode > "$created_api_key_path"
        chmod 600 "$created_api_key_path"
        api_key_path="$created_api_key_path"
    fi

    rm -f "$submit_zip"
    ditto -c -k --sequesterRsrc --keepParent "$app_dir" "$submit_zip"
    xcrun notarytool submit "$submit_zip" \
        --key "$api_key_path" \
        --key-id "$APPLE_API_KEY" \
        --issuer "$APPLE_API_ISSUER" \
        --wait
    rm -f "$submit_zip"
    xcrun stapler staple "$app_dir"
    xcrun stapler validate "$app_dir"
}

if [[ "$identity" == Developer\ ID\ Application:* ]]; then
    if has_notarization_credentials; then
        notarize_app
    elif [[ "${STASH_REQUIRE_NOTARIZATION:-}" == "1" ]]; then
        echo "STASH_REQUIRE_NOTARIZATION=1 needs APPLE_API_KEY, APPLE_API_ISSUER, and APPLE_API_KEY_PATH or APPLE_API_KEY_CONTENT" >&2
        exit 1
    else
        echo "Signed without notarization; not for a public GitHub Release" >&2
    fi
elif [[ "${STASH_REQUIRE_NOTARIZATION:-}" == "1" || "${STASH_REQUIRE_DEVELOPER_ID:-}" == "1" ]]; then
    echo "Public Stash releases require a Developer ID Application identity" >&2
    exit 1
else
    echo "Packaging an ad-hoc zip; not for a public GitHub Release" >&2
fi

rm -f "$zip_path" "$checksum_path"
(
    cd "$dist_dir"
    ditto -c -k --sequesterRsrc --keepParent "Stash Time Ledger.app" "$(basename "$zip_path")"
    shasum -a 256 "$(basename "$zip_path")" > "$(basename "$checksum_path")"
)

printf '%s\n' "$zip_path"
printf '%s\n' "$checksum_path"

# /.well-known/

Universal Links and Android App Links require real app identifiers from the
deployment owner. Do not deploy placeholder IDs.

## iOS: `apple-app-site-association`

Create `public/.well-known/apple-app-site-association` without a `.json`
extension and serve it as JSON.

Shape:

    {
      "applinks": {
        "apps": [],
        "details": [
          {
            "appID": "TEAMID.com.example.ciaorelated",
            "paths": ["/join/*", "/join"]
          }
        ]
      }
    }

Use your real Apple Team ID and iOS bundle identifier:

    "appID": "APPLE_TEAM_ID.com.example.ciaorelated"

## Android: `assetlinks.json`

Create `public/.well-known/assetlinks.json` and serve it as JSON.

Shape:

    [
      {
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
          "namespace": "android_app",
          "package_name": "com.example.ciaorelated",
          "sha256_cert_fingerprints": [
            "SHA256:RELEASE_CERTIFICATE_FINGERPRINT"
          ]
        }
      }
    ]

Use your real Android package name and release signing certificate SHA-256.

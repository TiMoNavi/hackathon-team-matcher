# App Store Review Notes Template

Use this template for App Store Connect review notes. Replace every value in angle brackets before submitting an app for review.

## Guideline 1.2 - User-Generated Content

Users must agree to our Terms of Service during registration, including a clear zero-tolerance policy for abusive or objectionable content.

All text inputs, including comments, usernames, and descriptions, are checked through a profanity filter.

Users can report content through `reportContent`, block other users through `blockUser` / `unblockUser`, and manage blocked profiles in the Settings screen.

Reports are reviewed manually within 24 hours. The admin interface supports daily checks through the `reports` and `reportsOverdue24h` GraphQL endpoints.

Reported content can be removed using `resolveReport` with action `DELETE_CONTENT`, and users can be temporarily suspended using `SUSPEND_USER`.

All uploaded images and videos are stored securely in Amazon S3 or another S3-compatible object storage provider. Access is handled through time-limited presigned URLs, so media is not publicly accessible without authorization.

## Guideline 5.1.1 - Privacy / Data Collection

Camera, microphone, and photo library access are only used to allow the user to create, upload, or share content.

Purpose strings are specific and included in `Info.plist`:

Camera:
`<We use your camera so you can take and upload photos or videos to share with your friends.>`

Microphone:
`<We use your microphone to let you record audio in your videos and voice messages.>`

Photo Library:
`<We use your photo library so you can select and upload images, for example when setting your profile picture.>`

The Privacy Policy is linked in-app through Settings -> Privacy and provided in App Store Connect.

Users can delete their account at any time through Settings -> Delete Account. This triggers the server-side deletion flow.

## Reviewer Test Account

This open-source repository does not include a shared reviewer account.

For App Store review, provide a dedicated test account in App Store Connect:

Login:
`<reviewer_username_or_email> / <reviewer_password>`

If the build uses email or SMS verification, either provide a pre-verified reviewer account or explain how the reviewer can access the verification code:

Verification:
`<pre-verified account / code sent to reviewer / code available in server console for development builds>`

## Steps To Test

1. Sign in with the reviewer test account.
2. Create a post.
3. Switch profile, if multiple profiles are enabled.
4. Find the post in the Explore tab.
5. Report the post.
6. Block a profile.
7. Open Settings.
8. Check Privacy Policy and Terms.
9. Delete the account.

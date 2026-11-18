# Reference photos: the photo libraries

The References panel (opened from the left navigation while generating) searches
an outside photo library and adds photos to the reference tray. One click adds a
photo; the Studio then copies it into the person's own storage, as an upload
would be, so generation can read it.

| Library | State | Server variable |
|---|---|---|
| Unsplash | On once the owner sets the key | `UNSPLASH_ACCESS_KEY` |
| Pinterest | Off (no official search access) | none in use (`PINTEREST_API_TOKEN` is reserved) |

Code: `lib/references/` (one file per library, the registry in `index.ts`),
`app/api/references/route.ts` (search), `app/api/references/import/route.ts`
(bring one photo in), `components/references/references-panel.tsx` (the panel
and `ReferenceCredit`).

Without a key the panel says "The photo library isn't set up yet" (the search
answers `available: false`, not an error, so Smart pick can ask quietly), and adding
a photo answers 503 with a plain sentence. Nothing else breaks.

---

## Unsplash: what the Studio does for its API guidelines

- **Official API only**: `api.unsplash.com` for search, a photo's details and
  download tracking; `images.unsplash.com` for the pictures. Requests go nowhere
  else; a redirect to another host is refused before it is followed. Every call
  has a deadline (8 s, 15 s for a picture) and a size limit (8 MB a picture).
- **The key stays on the server.** It is sent only to `api.unsplash.com`, never
  to a browser, never logged.
- **Hotlinking**: the grid and the tray show Unsplash's own image addresses.
- **Attribution**: every photo shows "Photo by *name* on Unsplash"; the name links
  to the photographer's Unsplash page and "Unsplash" to Unsplash, both with
  `utm_source=nmesis_studio&utm_medium=referral`. The same line can be shown
  wherever the photo appears later (`ReferenceCredit`).
- **Download tracking**: when someone adds a photo, the server requests that
  photo's `links.download_location` (with the key), after the picture itself has
  been fetched. A failure there is logged by status and does not undo the add.
- Searches are remembered for 10 minutes per server, so scrolling back and forth
  does not spend the hourly allowance twice.

## Unsplash: owner steps

1. Sign in at **unsplash.com/developers** with the account that should own the
   integration, open **Your apps → New Application**, and read and accept the
   API terms and guidelines (an owner decision; the Studio cannot do it).
2. Name the application (for example "Nmesis Studio") and describe it: "Reference
   photos for automotive creative work: search, then add a photo as a reference
   for image generation."
   The links carry `utm_source=nmesis_studio`. If the application's name is
   different, tell the developers so the `UTM` value in
   `lib/references/unsplash.ts` matches it.
3. Copy the **Access Key** (not the Secret key: the Studio never signs anybody in
   to Unsplash).
4. **Demo mode** is where every new application starts: **50 requests an hour**
   for the whole application. One page of search results is one request; adding
   a photo is one or two (the photo's details when it was not searched recently,
   then the download tracking). Enough to try it, not enough for a team.
5. **Apply for production** from the application's page once it works on a
   Preview deployment. Unsplash reviews it against the guidelines above and asks
   for screenshots: take one of the panel showing the credit under each photo,
   and one of a photo in the tray. Production allows **5,000 requests an hour**.
6. In **Vercel → the project → Settings → Environment Variables**, add
   `UNSPLASH_ACCESS_KEY`:
   - **Production**: the key of the application approved for production.
   - **Preview**: a separate key (a second Unsplash application in demo mode is
     enough), so Preview never spends Production's allowance.
   - Mark both **Sensitive**. Do not add it to `NEXT_PUBLIC_*`.
   - For a local Studio, put it in `.env.local` (never committed).
7. **Redeploy** each environment: a variable applies only to new deployments.
8. Check: open the References panel on Key visual, search, add a photo. The tick
   appears, then settles once the photo is in storage; the credit shows under it.
   In the Unsplash dashboard the application's request count goes up.

If the key is refused, the panel shows "The photo library refused the Studio's
access key. Ask Nmesis to check it." and the server log says
`Reference library request failed {"provider":"unsplash","status":401}`.
When the hourly allowance is used up, people are asked to try again in a few
minutes (status 403 with `x-ratelimit-remaining: 0`, or 429).

---

## Pinterest: stays off

`lib/references/pinterest.ts` is a stub: `available()` is false whatever the
environment says, it makes no request, and its search answers no photos with the
sentence "Pinterest search isn't available in the Studio." Nothing in the Studio
reads Pinterest's web pages for this panel.

What official access would be needed:

- An application approved on **developers.pinterest.com** with **Standard access**
  to the Pinterest API **v5** (`api.pinterest.com`).
- That API lets an application read the boards and pins of the account that
  connected it (OAuth, scopes `boards:read` and `pins:read`). A search of all of
  Pinterest is **not offered to general applications**, so a panel that searches
  Pinterest like it searches Unsplash cannot be built on it today.
- If Pinterest grants Nmesis an access that includes search, the developers
  implement the stub against `api.pinterest.com` only, read the token from
  `PINTEREST_API_TOKEN` (one per environment, like the Unsplash key), follow
  Pinterest's own attribution rules, and switch it on. Until then, do not set
  the variable: it has no effect.

The existing "paste a pin link" import (`lib/pinterest.ts`, `/api/pinterest`) is
separate and unchanged.

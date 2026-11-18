# S3 media storage setup

Owner steps for the studio's private media bucket. Do this once per environment: one bucket and one IAM user for Production, another pair for Preview. Real bucket names, account ids and keys go only into Vercel environment variables, never into this repository.

Below, `STUDIO_BUCKET` stands for the bucket's real name.

## 1. Bucket

In the S3 console, **Create bucket**:

- Region: **eu-central-1**.
- Object Ownership: **ACLs disabled** (bucket owner enforced).
- **Block all public access: on** (all four settings).
- Bucket versioning: **off**.
- Default encryption: **SSE-S3** (Amazon S3 managed keys), bucket key not needed.
- Object Lock: off.

## 2. Lifecycle rule

Bucket → **Management → Create lifecycle rule**:

- Name: `expire-staging-uploads`.
- Scope: **limit to a prefix**, prefix `staging/`.
- Action: **Expire current versions of objects**, after **1** day.
- Also tick **Delete expired object delete markers or incomplete multipart uploads**, incomplete multipart uploads after **1** day.

Never add an expiration that covers `orgs/`: it holds saved media, the library and encrypted provider connections (`orgs/<organization>/users/<user>/…`).

## 3. CORS

Bucket → **Permissions → Cross-origin resource sharing (CORS) → Edit**, paste [`s3-cors.example.json`](s3-cors.example.json) and replace `https://YOUR-STUDIO.vercel.app` with the studio's HTTPS domain for that environment (for Preview, its stable preview domain). Keep `http://localhost:3000` only on the Preview bucket if you develop against it locally. The browser uploads with signed `PUT` requests and reads media with signed `GET`/`HEAD` requests; the exposed headers let it resume ranges and read ETags.

## 4. IAM user

IAM → **Users → Create user**, for example `nmesis-studio-production` (no console access). Attach this inline policy (replace `STUDIO_BUCKET`), and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "StudioListBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::STUDIO_BUCKET"
    },
    {
      "Sid": "StudioObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::STUDIO_BUCKET/*"
    }
  ]
}
```

`s3:ListBucket` also lets a `HEAD` request for a missing object return 404 instead of 403, which the studio relies on. Then **Security credentials → Create access key** (application running outside AWS) and store the pair only in Vercel.

## 5. Vercel variables

For the matching environment (Production or Preview):

| Variable | Value |
| --- | --- |
| `S3_REGION` | `eu-central-1` |
| `S3_BUCKET` | the bucket name |
| `S3_ACCESS_KEY_ID` | the IAM user's access key id |
| `S3_SECRET_ACCESS_KEY` | the IAM user's secret access key |

Leave `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` unset on Vercel. Redeploy, then run `npm run check:setup` locally with the same values: it writes, conditionally rewrites, reads and deletes a probe object under `staging/`.

## 6. Brand logos from the configurator's private asset bucket

The top bar shows each brand's logo: the brand name icon its configurator shows. The configurator signs links only for the brand folders it has moved to its CDN, so for the other brands the Studio reads the icon from the configurator's asset bucket itself, signed with the Studio's own IAM user (S3 `GetObject`). Without this step those brands show their name alone. Per environment (Preview and Production each have their own IAM user):

1. Give the Studio's IAM user read on that bucket's icons only. Add to the IAM user's policy (replace `CONFIGURATOR_ASSET_BUCKET`):

   ```json
   {
     "Sid": "StudioReadsConfiguratorIcons",
     "Effect": "Allow",
     "Action": "s3:GetObject",
     "Resource": "arn:aws:s3:::CONFIGURATOR_ASSET_BUCKET/*/Icons/*"
   }
   ```

   If the bucket has a bucket policy that denies other principals, allow the Studio IAM user's ARN there too. If the bucket is encrypted with a customer-managed KMS key, the user also needs `kms:Decrypt` on that key.
2. Vercel variables (server-only):

   | Variable | Value |
   | --- | --- |
   | `CONFIGURATOR_ASSET_BUCKET` | the configurator's asset bucket name |
   | `CONFIGURATOR_ASSET_REGION` | that bucket's region |
   | `CONFIGURATOR_ASSET_HOSTS` | optional: the CDN host in front of the bucket (no `https://`), comma-separated if several |

3. Redeploy. A brand whose configurator has no brand name icon at all keeps showing its name alone; that is expected, not an error (the logo route answers 204).

## 7. Public view links (`public/`)

A public view link (Share, `lib/shares.ts`) shows a copy of the picture at `public/<32 random hex characters>` in the environment's own bucket. The address names no company, person or piece of work. The Studio's IAM user (section 4) already covers it; nothing to add.

The copy is deleted when the link is turned off or replaced, and after it expires by a sweep. The sweep runs when links are made or turned off, when someone opens a dead link, and daily on Production through Vercel Cron (`vercel.json`, `/api/cron/public-links`).

1. **Daily job (Production).** In Vercel → Settings → Environment Variables, add `CRON_SECRET` for Production: a random string of at least 16 characters, marked Sensitive. Then redeploy. Vercel sends it with each cron call, and the route refuses every other caller. Without it, the daily job does nothing; the other sweeps still run.
2. **Optional backstop, per bucket.** Add an S3 lifecycle rule that expires objects under the `public/` prefix after 31 days. That is one day past the longest link (30 days). Preview has no Vercel Cron, so this rule is the only scheduled cleanup there.

## Notes

- Conditional writes: the studio creates lock and cache objects with `If-None-Match: *` and replaces them with `If-Match: <ETag>`. S3 answers `412 Precondition Failed` (or `409` for a concurrent conflicting write), which the studio treats as "not written", the same as before. `If-None-Match` with an ETag is not used (S3 accepts only `*`).
- Checksums are computed only where S3 requires them, which keeps signed browser uploads working.

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

## Notes

- Conditional writes: the studio creates lock and cache objects with `If-None-Match: *` and replaces them with `If-Match: <ETag>`. S3 answers `412 Precondition Failed` (or `409` for a concurrent conflicting write), which the studio treats as "not written", the same as before. `If-None-Match` with an ETag is not used (S3 accepts only `*`).
- Checksums are computed only where S3 requires them, which keeps signed browser uploads working.


# Random Scripts

## Generate Signed URL for CloudFront Distribution Videos Example

```bash
python generate_signed_url.py --namespace dvai --region eu-west-1 --expires 300  --base-url https://sandbox.cus-paycol-debt-video-ai-engine.aws.edfcloud.io sample.mp4
```

## Update a manifest case_id in S3

```bash
python update_manifest_case.py \
	--bucket ${MY_BUCKET} \
	--manifest-key manifests/case-2025-001.json \
	--new-case-id CASE-2025-123 \
	--delete-source
```

- `--bucket` and either `--manifest-key` or `--case-id` are required to locate the source manifest.
- `--prefix` defaults to `manifests/` but can be customized for different suites.
- When the destination key is not provided, the script writes the manifest back to `prefix/sanitized-case-id.json` (lowercase, non-alphanumerics replaced with dashes).
- Use `--force` to overwrite an existing destination key, `--dry-run` to preview, and `--delete-source` to remove the original manifest after renaming.

## Duplicate a case for load-testing

This script copies the manifest for a known case and copies each video entry to a new case identifier so the report lambda thinks it is an entirely different case.

```bash
python duplicate_case_videos.py \
	--bucket ${MY_BUCKET} \
	--base-case AB03524FF \
	--case-pattern LOAD{index:03d} \
	--start-index 1 \
	--count 500
```

- `--case-pattern` requires `{index}` and defaults to `LOAD{index:03d}`; adjust it if you need different naming (e.g., `TEST-{index}`).
- `--manifest-prefix` defaults to `manifests/`, but you can override it to match the structure in the bucket.
- `--force` lets you overwrite previously generated manifests/videos, while `--dry-run` previews the copy plan without changing S3.
- `--video-prefix` defaults to `videos/` so the script copies objects under that folder even if the manifest only lists the basename; override it if your manifest stores fully qualified keys in another prefix.

## Copy manifests and videos sequentially into the processing bucket

This script ensures each manifest arrives (and then its associated videos) before moving on to the next case so the pipeline always sees the manifest before it starts working on the video data.

```bash
python sync_manifests_with_videos.py \
	--src-bucket dvai-eu-west-1-source-data \
	--dest-bucket dvai-eu-west-1-internal-20251126120238726100000001 \
	--manifest-prefix manifests/ \
	--video-prefix raw-videos/ \
	--filter LOAD \
	--dry-run
```

- `--dest-manifest-prefix` and `--video-prefix` let you change the destination layout if needed (otherwise they mirror the source prefixes).
- `--src-video-prefix` allows you to copy from a different source prefix (e.g., the sync source bucket might store raw files under `videos/` while the pipeline expects `raw-videos/`).
- `--filter` limits the copy to manifests whose keys contain the given substring (useful to target only the `LOADxxx` cases you just generated).
- Use `--force` if you need to re-push cases that already exist in the destination bucket.

## Monitor pipeline progress during load tests

Keep the pipeline monitoring script running while you stream manifests/videos into the internal bucket. It polls the internal bucket (default prefixes: `manifests/`, `raw-videos/`, `transcoded-videos/`, `label-files/`, `transcript-output/`, `results/`) and reports when each case becomes visible at each stage (manifest, raw upload, transcoded output, Rekognition labels, Rekognition faces, transcription results, final report).

```bash
python monitor_processing_progress.py \
	--bucket dvai-eu-west-1-internal-20251126120238726100000001 \
	--throttle-table dvai_rekognition_throttle_dev \
	--filter LOAD \
	--interval 15
```

- `--throttle-table` displays the current Rekognition job count from the DynamoDB throttle table.
- `--filter` keeps the loop focused on the cases you just generated (manifests containing `LOAD`).
- `--limit` reduces the manifest set if you only want to watch a handful at a time.
- Add `--verbose` to dump per-video timestamps per iteration.

Example output:
```
[2026-01-02 15:45:13] Iteration 434: Tracking 9 cases | Rekognition jobs: 0
Case       Raw     Transcoded   Labels    Faces     Transcript   Report   Duration
LOAD001    14:27:28 14:35:59     14:39:37  15:27:22  14:36:42    15:38:23 1:10:55
LOAD002    14:27:40 14:36:34     14:43:42  15:32:46  14:37:26    15:42:48 1:15:08
```

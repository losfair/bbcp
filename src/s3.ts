import { S3Credentials, S3GetObjectRequest, S3ListObjectsV2Request, S3PresignInfo, S3Region } from "blueboat-types/src/native_schema";

const s3Ak = App.mustGetEnv("s3AccessKeyId");
const s3Sk = App.mustGetEnv("s3SecretAccessKey");

const s3Credentials: S3Credentials = {
  key: s3Ak,
  secret: s3Sk,
};
const s3Region: S3Region = {
  name: App.mustGetEnv("s3Region"),
  endpoint: App.env["s3Endpoint"],
};

export const s3Bucket = App.mustGetEnv("s3Bucket");
export const s3Prefix = App.mustGetEnv("s3Prefix");

export function signS3Request(info: S3PresignInfo): string {
  return ExternalService.AWS.getPresignedUrl(s3Region, s3Credentials, info, {
    expires_in_secs: 60,
  });
}

export async function listUnderSubprefix(subprefix: string): Promise<string[]> {
  const fullPrefix = s3Prefix + subprefix;
  const req: S3ListObjectsV2Request = {
    bucket: s3Bucket,
    prefix: fullPrefix,
    delimiter: "/",
  };
  const res = await ExternalService.AWS.listObjectsV2(s3Region, s3Credentials, req);
  const commonPrefixes = (res.common_prefixes || [])
    .filter(x => x && x.startsWith(fullPrefix))
    .map(x => x!.substring(fullPrefix.length, x!.length - 1));
  return commonPrefixes;
}

export async function getObject(key: string): Promise<Uint8Array | null> {
  const req: S3GetObjectRequest = {
    bucket: s3Bucket,
    key,
  };
  const url = ExternalService.AWS.getPresignedUrl(s3Region, s3Credentials, {
    type: "getObject",
    request: req,
  }, {
    expires_in_secs: 60,
  });
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status == 404) return null;
    const text = await res.text();
    throw new Error(
      `getObject failed on key ${JSON.stringify(key)}: ${res.status}: ${text}`
    );
  }

  return new Uint8Array(await res.arrayBuffer());
}

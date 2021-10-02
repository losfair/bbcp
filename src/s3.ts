import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Ak = App.mustGetEnv("s3AccessKeyId");
const s3Sk = App.mustGetEnv("s3SecretAccessKey");

export const s3Client = new S3Client({
  endpoint: App.env["s3Endpoint"],
  region: App.mustGetEnv("s3Region"),
  credentials: {
    accessKeyId: s3Ak,
    secretAccessKey: s3Sk,
  },
  forcePathStyle: true,
});

export const s3Bucket = App.mustGetEnv("s3Bucket");
export const s3Prefix = App.mustGetEnv("s3Prefix");

export async function listUnderSubprefix(subprefix: string): Promise<string[]> {
  const fullPrefix = s3Prefix + subprefix;
  const cmd = new ListObjectsV2Command({
    Bucket: s3Bucket,
    Prefix: fullPrefix,
    Delimiter: "/",
  });
  const url = await getSignedUrl(s3Client, cmd, { expiresIn: 60 });
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error("list bucket error: " + text);
  return tearApartListBucketResponse(text)
    .filter((x) => x.startsWith(fullPrefix))
    .map((x) => x.substring(fullPrefix.length, x.length - 1));
}

export async function getObject(key: string): Promise<Uint8Array | null> {
  const cmd = new GetObjectCommand({
    Bucket: s3Bucket,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, cmd, { expiresIn: 60 });
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

// It's best if we parse the XML properly but...
function tearApartListBucketResponse(xml: string): string[] {
  const r = /<CommonPrefixes><Prefix>((.(?!<))*.)<\/Prefix><\/CommonPrefixes>/g;
  const res: string[] = [];
  while (true) {
    const match = r.exec(xml);
    if (!match) break;
    res.push(match[1]);
  }

  return res;
}

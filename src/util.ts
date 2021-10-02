import { s3Prefix } from "./s3";

export function generate32chId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Codec.hexencode(bytes);
}

const appIdMatcher = /^([0-9a-z.@-]+)$/;
export function isValidAppId(x: string): boolean {
  return appIdMatcher.test(x) && x.length <= 80;
}

const imageIdMatcher = /^([0-9a-zA-Z_-]+)\.tar$/;
export function isValidImageId(x: string): boolean {
  return imageIdMatcher.test(x) && x.length <= 100;
}

const packageVersionMatcher = /^([0-9a-zA-Z._@-]+)$/;
export function isValidPackageVersion(x: string): boolean {
  return packageVersionMatcher.test(x) && x.length <= 80;
}

export function s3PrefixFromGhid(ghid: number): string {
  return "gh_" + ghid + "/";
}

export const packageImagePrefix = "packages/";

export function mkJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function mkJsonErrorResponse(msg: string, status: number): Response {
  return mkJsonResponse(
    {
      type: "generic_error",
      message: msg,
    },
    status
  );
}

export function buildPackageFullPath(
  ghid: number,
  appid: string,
  imageId: string
): string {
  return buildAppPrefix(ghid, appid) + packageImagePrefix + imageId;
}

export function buildAppPrefix(ghid: number, appid: string): string {
  return s3Prefix + s3PrefixFromGhid(ghid) + appid + "/";
}

export function clientAccepts(req: Request, contentType: string): boolean {
  return (
    (req.headers.get("accept") || "")
      .split(",")
      .findIndex((x) => x.trim() == contentType) != -1
  );
}

export function formatDate(d: Date): string {
  const YYYY = d.getUTCFullYear().toString();
  const MM = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const DD = d.getUTCDate().toString().padStart(2, "0");
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  const ss = d.getUTCSeconds().toString().padStart(2, "0");
  return `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
}

export const appDB = App.mysql.db;
if (!appDB) throw new Error("missing db");

export const sysDB = App.mysql.sys;
if (!sysDB) throw new Error("missing sysdb");

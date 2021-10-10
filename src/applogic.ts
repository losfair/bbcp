import {
  AppMetadata,
  schema_AppMetadata,
  transformAppMetadataToFrontend,
  validateAndTransformAppMetadataFromFrontend,
} from "./metadata";
import { getObject, listUnderSubprefix, s3Bucket, signS3Request } from "./s3";
import { ensureAuthenticatedSession } from "./session";
import {
  buildAppPrefix,
  formatDate,
  generate32chId,
  isValidAppId,
  mkJsonErrorResponse,
  mkJsonResponse,
  packageImagePrefix,
  s3PrefixFromGhid,
} from "./util";
import { JTDSchemaType } from "blueboat-types/src/validation/jtd";
import { S3PutObjectRequest } from "blueboat-types/src/native_schema";

Router.get("/app/list", async (req) => {
  const sess = await ensureAuthenticatedSession(req);
  if (sess instanceof Response) return sess;

  const applist = await listUnderSubprefix(s3PrefixFromGhid(sess.ghid));

  return mkJsonResponse(applist);
});

Router.get("/app/metadata", async (req) => {
  const sess = await ensureAuthenticatedSession(req);
  if (sess instanceof Response) return sess;

  const url = new URL(req.url);
  const appid = url.searchParams.get("appid") || "";
  if (!isValidAppId(appid)) return mkJsonErrorResponse("invalid appid", 400);

  const metadataJsonBytes = await getObject(
    buildAppPrefix(sess.ghid, appid) + "metadata.json"
  );
  if (!metadataJsonBytes)
    return mkJsonErrorResponse("app metadata not found", 404);
  const metadata: AppMetadata = JSON.parse(
    new TextDecoder().decode(metadataJsonBytes)
  );
  transformAppMetadataToFrontend(metadata);
  return mkJsonResponse(metadata);
});

export interface AppUploadRequest {
  appid: string;
  content_length: number;
}

const schema_AppUploadRequest: JTDSchemaType<AppUploadRequest> = {
  properties: {
    appid: { type: "string" },
    content_length: { type: "uint32" },
  },
};

const validator_AppUploadRequest = new Validation.JTD.JTDStaticSchema(
  schema_AppUploadRequest
);

Router.post("/app/upload", async (req) => {
  const sess = await ensureAuthenticatedSession(req);
  if (sess instanceof Response) return sess;

  const body: unknown = await req.json();
  if (!validator_AppUploadRequest.validate(body))
    return mkJsonErrorResponse(validator_AppUploadRequest.lastError || "", 400);
  if (!isValidAppId(body.appid))
    return mkJsonErrorResponse("invalid appid", 400);

  const imageId = `${formatDate(new Date())}-${generate32chId()}.tar`;
  const s3Req: S3PutObjectRequest = {
    bucket: s3Bucket,
    key: buildAppPrefix(sess.ghid, body.appid) + packageImagePrefix + imageId,
    content_type: "application/x-tar",
    content_length: body.content_length,
  };
  const signedUrl = signS3Request({
    type: "putObject",
    request: s3Req,
  });
  return mkJsonResponse({
    url: signedUrl,
    image_id: imageId,
  });
});

export interface AppCreateRequest {
  appid: string;
  metadata: AppMetadata;
}

const schema_AppCreateRequest: JTDSchemaType<AppCreateRequest> = {
  properties: {
    appid: { type: "string" },
    metadata: schema_AppMetadata,
  },
};
const validator_AppCreateRequest = new Validation.JTD.JTDStaticSchema(
  schema_AppCreateRequest
);

Router.post("/app/create", async (req) => {
  const sess = await ensureAuthenticatedSession(req);
  if (sess instanceof Response) return sess;

  const body: unknown = await req.json();
  if (!validator_AppCreateRequest.validate(body))
    return mkJsonErrorResponse(validator_AppCreateRequest.lastError || "", 400);
  if (!isValidAppId(body.appid))
    return mkJsonErrorResponse("invalid appid", 400);

  const metadataValidationError = validateAndTransformAppMetadataFromFrontend(
    sess,
    body.appid,
    body.metadata
  );
  if (metadataValidationError !== undefined) {
    return mkJsonErrorResponse(metadataValidationError, 400);
  }
  const metadataJson = JSON.stringify(body.metadata);
  const metadataKey = buildAppPrefix(sess.ghid, body.appid) + "metadata.json";
  const s3Req: S3PutObjectRequest = {
    bucket: s3Bucket,
    key: metadataKey,
    content_type: "application/json",
  };

  const signedUrl = signS3Request({
    type: "putObject",
    request: s3Req,
  });
  const s3Res = await fetch(signedUrl, {
    method: "PUT",
    body: metadataJson,
  });
  if (!s3Res.ok) {
    throw new Error("s3 put failed: " + (await s3Res.text()));
  }
  return mkJsonResponse({ metadata_key: metadataKey });
});

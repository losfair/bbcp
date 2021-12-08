import { JTDSchemaType } from "blueboat-types/src/validation/jtd";
import { SessionInfo } from "./session";
import {
  buildPackageFullPath,
  isValidImageId as isValidImageId,
  isValidPackageVersion,
} from "./util";

export interface AppMetadata {
  version: string;
  package: string;
  env: Record<string, string>;
  mysql: Record<string, MysqlMetadata> | null;
  apns: Record<string, ApnsMetadata> | null;
  kv_namespaces: Record<string, KvNamespaceMetadata> | null;
}

export interface KvNamespaceMetadata {
  shard: string;
  prefix: string;
}

export interface MysqlMetadata {
  url: string;
}

export interface ApnsMetadata {
  endpoint: "production" | "sandbox";
  cert: string;
}

export const schema_AppMetadata: JTDSchemaType<AppMetadata> = {
  properties: {
    version: { type: "string" },
    package: { type: "string" },
    env: {
      values: {
        type: "string",
      },
    },
    mysql: {
      values: {
        properties: {
          url: { type: "string" },
        },
      },
      nullable: true,
    },
    apns: {
      values: {
        properties: {
          endpoint: { enum: ["production", "sandbox"] },
          cert: { type: "string" },
        },
      },
      nullable: true,
    },
    kv_namespaces: {
      values: {
        properties: {
          shard: { type: "string" },
          prefix: { type: "string" },
        },
      },
      nullable: true,
    }
  },
};

const validator_AppMetadata = new Validation.JTD.JTDStaticSchema(
  schema_AppMetadata
);

export function transformAppMetadataToFrontend(x: AppMetadata) {
  {
    const segs = x.package.split("/");
    x.package = segs[segs.length - 1];
  }
}

export function validateAndTransformAppMetadataFromFrontend(
  sess: SessionInfo,
  appid: string,
  x: AppMetadata
): string | undefined {
  if (x.apns) {
    for (const k in x.apns) {
      try {
        Codec.b64decode(x.apns[k].cert);
      } catch (e) {
        return "invalid base64 encoding for apns cert " + k;
      }
    }
  }

  if (!isValidImageId(x.package)) {
    return "invalid image id";
  }
  x.package = buildPackageFullPath(sess.ghid, appid, x.package);

  if (!isValidPackageVersion(x.version)) {
    return "invalid package version";
  }
  return undefined;
}

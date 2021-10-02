import { JTDSchemaType } from "jsland-types/src/validation/jtd";
import { ensureAuthenticatedSession } from "./session";
import {
  buildAppPrefix,
  isValidAppId,
  mkJsonErrorResponse,
  mkJsonResponse,
  sysDB,
} from "./util";

const reqidMatcher = /^([0-9a-z:+-]+)$/;

const maxLogsPerQuery = 1000;

interface LogQueryRequest {
  appid: string;
  reqid: string | null;
  before: number | null;
  limit: number;
}

const schema_LogQueryRequest: JTDSchemaType<LogQueryRequest> = {
  properties: {
    appid: { type: "string" },
    reqid: { type: "string", nullable: true },
    before: { type: "float64", nullable: true },
    limit: { type: "uint32" },
  },
};

const validator_LogQueryRequest = new Validation.JTD.JTDStaticSchema(
  schema_LogQueryRequest
);

Router.post("/ops/logs", async (req) => {
  const sess = await ensureAuthenticatedSession(req);
  if (sess instanceof Response) return sess;

  const body: unknown = await req.json();
  if (!validator_LogQueryRequest.validate(body))
    return mkJsonErrorResponse(validator_LogQueryRequest.lastError || "", 400);
  if (!isValidAppId(body.appid))
    return mkJsonErrorResponse("invalid appid", 400);

  // Ignoring this test does not cause security issues (it's just a LIKE matcher anyway) but may
  // cause slowdown
  if (body.reqid && !reqidMatcher.test(body.reqid))
    return mkJsonErrorResponse("invalid reqid", 400);

  const apppath = buildAppPrefix(sess.ghid, body.appid) + "metadata.json";
  const limit =
    body.limit === 0 ? maxLogsPerQuery : Math.min(body.limit, maxLogsPerQuery);

  const rows = (
    await sysDB.exec(
      `
    select appversion, reqid, msg, logseq, logtime
      from applog_managed
      where apppath = :apppath
        ${body.before ? "and logtime <= :before" : ""}
        ${body.reqid ? "and reqid like :reqid" : ""}
      order by logtime desc
      limit :limit
    `,
      {
        apppath: ["s", apppath],
        limit: ["i", limit],
        ...(body.before ? { before: ["d", new Date(body.before)] } : {}),
        ...(body.reqid ? { reqid: ["s", body.reqid + "%"] } : {}),
      },
      "sssid"
    )
  ).map(([appversion, reqid, msg, logseq, logtime]) => ({
    appversion,
    reqid,
    msg,
    logseq,
    logtime: logtime!.getTime(),
  }));
  return mkJsonResponse(rows);
});

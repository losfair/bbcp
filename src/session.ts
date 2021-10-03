import { JTDSchemaType } from "blueboat-types/src/validation/jtd";
import { verifyOpSig } from "./crypto";
import {
  appDB,
  generate32chId,
  mkJsonErrorResponse,
  mkJsonResponse,
} from "./util";

const ghClientId = App.mustGetEnv("ghClientId");
const ghClientSecret = App.mustGetEnv("ghClientSecret");
const ghApp = new ExternalService.GitHub.OAuthApp({
  clientId: ghClientId,
  clientSecret: ghClientSecret,
});
const ghAllowList = (App.env["ghAllowList"] || "")
  .split(",")
  .map((x) => x.trim())
  .filter((x) => x);

export interface SessionInfo {
  id: string;
  tokenId: string;
  ghid: number;
  ghlogin: string;
  ghdisplayname: string;
}

export async function getAuthenticatedSession(
  req: Request
): Promise<SessionInfo | string> {
  const sessionId = req.headers.get("x-bbcp-session-id") || "";

  if (sessionId) {
    const res = (
      await appDB.exec(
        "select token_id, ghid, ghlogin, ghdisplayname from valid_session where id = :id",
        {
          id: ["s", sessionId],
        },
        "siss"
      )
    )[0];
    if (res) {
      const [tokenId, ghid, ghlogin, ghdisplayname] = res;
      return {
        id: sessionId,
        tokenId: tokenId || "",
        ghid: ghid || 0,
        ghlogin: ghlogin || "",
        ghdisplayname: ghdisplayname || "",
      };
    }
  }

  return "bad_session";
}

export async function ensureAuthenticatedSession(
  req: Request
): Promise<SessionInfo | Response> {
  const sessionInfo = await getAuthenticatedSession(req);
  if (typeof sessionInfo === "string") {
    return mkJsonResponse(
      {
        type: "session_error",
        message: sessionInfo,
      },
      401
    );
  }
  return sessionInfo;
}

interface SessionEntryOutput {
  session_id: string;
  expiry: number;
}

async function processTokenGrant(
  id: string,
  proofOfInitRequest: string,
  ghToken: string,
  t: number
): Promise<Response | null> {
  // Handle NaN
  if (!(Math.abs(t - Date.now()) <= 300 * 1000)) {
    throw new Error("invalid request time");
  }

  if (!verifyOpSig(id, proofOfInitRequest, "init", "" + t)) {
    throw new Error("invalid proof of init request");
  }

  const octokit = new ExternalService.GitHub.Octokit({
    auth: ghToken,
    userAgent: "bbcp on blueboat by z@univalence.me",
  });
  const user = await octokit.rest.users.getAuthenticated();
  if (
    ghAllowList.length &&
    ghAllowList.findIndex((x) => x === user.data.login) == -1
  ) {
    return mkJsonErrorResponse("user not allowed", 403);
  }
  await appDB.exec(
    "replace into `token` (`id`, `ghid`, `ghtoken`) values(:id, :ghid, :ghtoken)",
    {
      id: ["s", id],
      ghid: ["i", user.data.id],
      ghtoken: ["s", ghToken],
    },
    ""
  );
  return null;
}

async function processSessionGrant(
  requestTime: number,
  tokenId: string,
  proofOfGrantRequest: string
): Promise<SessionEntryOutput | Response> {
  // Handle NaN
  if (!(Math.abs(requestTime - Date.now()) <= 300 * 1000)) {
    throw new Error("invalid request time");
  }

  if (
    !verifyOpSig(
      tokenId,
      proofOfGrantRequest,
      "grant_session",
      "" + requestTime
    )
  ) {
    throw new Error("invalid proof of session grant request");
  }

  const res = (
    await appDB.exec(
      "select ghtoken from valid_token where id = :id",
      {
        id: ["s", tokenId],
      },
      "s"
    )
  )[0];
  if (!res) {
    return mkJsonResponse(
      {
        type: "invalid_token",
      },
      401
    );
  }

  const [ghToken] = res;

  const octokit = new ExternalService.GitHub.Octokit({
    auth: ghToken || "",
    userAgent: "bbcp on blueboat by z@univalence.me",
  });
  const user = await octokit.rest.users.getAuthenticated();
  const sessionId = generate32chId();
  await appDB.exec(
    "update `token` set last_used_at = current_timestamp(6) where id = :id",
    {
      id: ["s", tokenId],
    },
    ""
  );
  await appDB.exec(
    "insert into `session` (`id`, `token_id`, `ghid`, `ghlogin`, `ghdisplayname`) values(:id, :tid, :ghid, :ghl, :ghdn)",
    {
      id: ["s", sessionId],
      tid: ["s", tokenId],
      ghid: ["i", user.data.id],
      ghl: ["s", user.data.login],
      ghdn: ["s", user.data.name || ""],
    },
    ""
  );
  const [expiry] = (
    await appDB.exec(
      "select `expiry` from `session` where id = :id",
      {
        id: ["s", sessionId],
      },
      "d"
    )
  )[0];
  return {
    session_id: sessionId,
    expiry: expiry!.getTime(),
  };
}

interface SessionGrantRequest {
  request_time: number;
  token_id: string;
  proof_of_grant_request: string;
}

const schema_SessionGrantRequest: JTDSchemaType<SessionGrantRequest> = {
  properties: {
    request_time: { type: "float64" },
    token_id: { type: "string" },
    proof_of_grant_request: { type: "string" },
  },
};
const validator_SessionGrantRequest = new Validation.JTD.JTDStaticSchema(
  schema_SessionGrantRequest
);

Router.get("/ghlogin", async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenId = url.searchParams.get("token_id");
  const proof = url.searchParams.get("proof");
  const tStr = url.searchParams.get("t");
  if (!tStr) return mkJsonErrorResponse("missing t", 400);
  const t = parseInt(tStr);
  if (!Number.isSafeInteger(t)) return mkJsonErrorResponse("bad t", 400);

  if (!tokenId) return mkJsonErrorResponse("missing token_id", 400);
  if (!proof) return mkJsonErrorResponse("missing proof", 400);

  if (!code) {
    const redirectUrl = new URL("/ghlogin", request.url);
    redirectUrl.searchParams.set("token_id", tokenId);
    redirectUrl.searchParams.set("proof", proof);
    redirectUrl.searchParams.set("t", tStr);
    const urlInfo = ghApp.getWebFlowAuthorizationUrl({
      scopes: [],
      redirectUrl: redirectUrl.toString(),
    });
    return Response.redirect(urlInfo.url, 302);
  }

  const tokenInfo = await ghApp.createToken({ code });
  const res = await processTokenGrant(
    tokenId,
    proof,
    tokenInfo.authentication.token,
    t
  );
  if (res instanceof Response) return res;

  return mkJsonResponse({
    ok: true,
  });
});

Router.post("/mksession", async (request) => {
  const body: unknown = await request.json();
  if (!validator_SessionGrantRequest.validate(body))
    return mkJsonErrorResponse(
      validator_SessionGrantRequest.lastError || "",
      400
    );

  const session = await processSessionGrant(
    body.request_time,
    body.token_id,
    body.proof_of_grant_request
  );
  if (session instanceof Response) return session;
  return mkJsonResponse(session);
});

Router.post("/revoke_token_by_id", async (request) => {
  const sess = await ensureAuthenticatedSession(request);
  if (sess instanceof Response) return sess;

  await appDB.exec(
    "update `token` set active = 0 where id = :id",
    {
      id: ["s", sess.tokenId],
    },
    ""
  );
  return mkJsonResponse({
    ok: true,
  });
});

Router.post("/revoke_token_by_ghid", async (request) => {
  const sess = await ensureAuthenticatedSession(request);
  if (sess instanceof Response) return sess;

  await appDB.exec(
    "update `token` set active = 0 where ghid = :ghid",
    {
      ghid: ["i", sess.ghid],
    },
    ""
  );
  return mkJsonResponse({
    ok: true,
  });
});

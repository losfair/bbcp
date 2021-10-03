/// <reference path="../node_modules/blueboat-types/src/index.d.ts" />

import "./session";
import "./applogic";
import "./opslogic";

Router.get("/", () => new Response("bbcp ok"));

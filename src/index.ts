/// <reference path="../node_modules/jsland-types/src/index.d.ts" />

import "./session";
import "./applogic";
import "./opslogic";

Router.get("/", () => new Response("rwcp ok"));

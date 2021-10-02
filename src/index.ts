/// <reference path="../node_modules/jsland-types/src/index.d.ts" />

import "./session";
import "./applogic";

Router.get("/", () => new Response("rwcp ok"));
